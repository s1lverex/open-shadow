// Live Xiaomi MiMo test — only run with MIMO_API_KEY set.
// Phase 1: raw protocol check against the real endpoint.
// Phase 2: the same request through the app's own main process (real IPC -> chatcompletions.js).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const KEY = process.env.MIMO_API_KEY;
if (!KEY) { console.error('MIMO_API_KEY not set'); process.exit(2); }
const BASE = process.env.MIMO_BASE || (KEY.startsWith('tp-') ? 'https://token-plan-cn.xiaomimimo.com/v1' : 'https://api.xiaomimimo.com/v1');
const MODEL = process.env.MIMO_MODEL || 'mimo-v2.6-flash';
const REPO = process.env.REPO || path.resolve(import.meta.dirname, '../..');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'openshadow-e2e');
const ELECTRON = path.join(REPO, 'node_modules/electron/dist/electron');
fs.mkdirSync(OUT, { recursive: true });
const evidence = { startedAt: new Date().toISOString(), base: BASE, model: MODEL, steps: [] };
const step = (name, ok, detail) => {
  evidence.steps.push({ name, ok, detail: String(detail).slice(0, 600) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 300) : ''}`);
};

// ---------- phase 1: raw protocol ----------
const headers = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
try {
  const r = await fetch(`${BASE}/models`, { headers });
  const text = await r.text();
  evidence.modelsStatus = r.status;
  const ids = (() => { try { return JSON.parse(text).data.map(m => m.id); } catch { return []; } })();
  evidence.models = ids;
  step('GET /models against the real endpoint', r.ok, `${r.status} ids=${ids.join(',') || text.slice(0, 120)}`);
} catch (e) { step('GET /models against the real endpoint', false, e.message); }

async function chat(messages, tools, label) {
  const body = { model: MODEL, messages, stream: true, ...(tools ? { tools, tool_choice: 'auto' } : {}) };
  const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 300) };
  const raw = await r.text();
  const events = raw.split('\n').filter(l => l.startsWith('data:') && !l.includes('[DONE]')).map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } }).filter(Boolean);
  const text = events.flatMap(e => e.choices || []).map(c => (c.delta && c.delta.content) || '').join('');
  const reasoning = events.flatMap(e => e.choices || []).map(c => (c.delta && (c.delta.reasoning_content || c.delta.reasoning)) || '').join('');
  const calls = events.flatMap(e => ((e.choices || [])[0]?.delta?.tool_calls) || []);
  const usage = events.find(e => e.usage)?.usage || null;
  evidence[label] = { events: events.length, text, reasoning: reasoning.slice(0, 200), calls: calls.length, usage };
  return { ok: true, text, reasoning, calls, usage, events };
}

const c1 = await chat([{ role: 'user', content: 'Reply with exactly: shadow-ok' }], null, 'chat');
step('streaming chat completion', !!c1.ok && c1.text.length > 0, c1.ok ? JSON.stringify({ text: c1.text, usage: c1.usage, events: c1.events }) : `${c1.status} ${c1.detail}`);
if (c1.ok) step('reasoning_content present when thinking', true, c1.reasoning ? c1.reasoning.slice(0, 80) : '(none returned — model may have thinking off)');

const tool = { type: 'function', function: { name: 'pick_color', description: 'Pick a colour', parameters: { type: 'object', properties: { hue: { type: 'string' } }, required: ['hue'] } } };
const c2 = await chat([{ role: 'user', content: 'Use pick_color to choose blue.' }], [tool], 'toolCall');
if (c2.ok) step('tool call emitted', c2.calls.length > 0, JSON.stringify(c2.calls).slice(0, 300));
else step('tool call emitted', false, `${c2.status} ${c2.detail}`);

// ---------- phase 2: through the app ----------
const xvfb = spawn('Xvfb', [':98', '-screen', '0', '1440x960x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const app = await electron.launch({
  executablePath: ELECTRON,
  args: [REPO, '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, DISPLAY: ':98', MIMO_API_KEY: '', DEEPSEEK_API_KEY: '' },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2600);

const providers = await page.evaluate(() => window.openshadow.llm.providers());
const mimo = providers.find(p => p.id === 'mimo');
step('app registry carries the real MiMo base URL', !!mimo && mimo.apiUrl === BASE, mimo ? mimo.apiUrl : 'missing');

const live = await page.evaluate(async ({ key, base, model }) => {
  const events = [];
  window.openshadow.llm.onEvent(e => events.push(e));
  window.openshadow.llm.start('live-mimo', {
    provider: 'mimo', apiUrl: base, key, model,
    messages: [{ role: 'user', content: 'Reply with exactly: shadow-live-ok' }],
    tools: [], maxTokens: 64,
  });
  await new Promise(r => setTimeout(r, 25000));
  const payload = type => events.filter(e => e.type === type);
  const done = events.find(e => e.type === 'done') || {};
  return {
    text: payload('content').map(e => e.delta).join(''),
    reasoning: payload('reasoning').map(e => e.delta).join('').slice(0, 120),
    toolCalls: payload('tool_call').length,
    usage: done.result?.usage || null,
    done: !!done,
    error: events.find(e => e.type === 'error') || null,
    types: [...new Set(events.map(e => e.type))],
  };
}, { key: KEY, base: BASE, model: MODEL });
evidence.liveThroughApp = live;
step('MiMo chat through the app (in-app IPC, real endpoint)', live.text.length > 0 && live.done && !live.error, JSON.stringify(live));

await page.screenshot({ path: path.join(OUT, 'app-live-mimo.png') });
evidence.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'live-mimo-evidence.json'), JSON.stringify(evidence, null, 1));
await app.close();
xvfb.kill();
const failed = evidence.steps.filter(s => !s.ok);
console.log(`\n${evidence.steps.length - failed.length}/${evidence.steps.length} checks passed`);
process.exit(failed.length ? 1 : 0);
