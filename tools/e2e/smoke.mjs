// Open Shadow in-app smoke test.
// Launches the REAL Electron app (headless, Xvfb), captures the opening animation,
// exercises the real IPC bridge, and streams a chat from a mock MiMo-protocol server
// through the app's own main process.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const REPO = process.env.REPO || path.resolve(import.meta.dirname, '../..');
const OUT = process.env.OUT_DIR || path.join(import.meta.dirname, 'shots');
const ELECTRON = path.join(REPO, 'node_modules/electron/dist/electron');
fs.mkdirSync(OUT, { recursive: true });

const evidence = { startedAt: new Date().toISOString(), repo: REPO, steps: [], received: [] };
const step = (name, ok, detail) => {
  evidence.steps.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// ---- mock provider: MiMo's documented Chat Completions protocol -------------
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const record = { method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null };
    evidence.received.push(record);
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ object: 'list', data: [{ id: 'mimo-v2.6-flash' }, { id: 'mimo-v2.6-pro' }, { id: 'mimo-v2.5-pro' }] }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = o => `data: ${JSON.stringify(o)}\n\n`;
    res.write(chunk({ choices: [{ delta: { reasoning_content: 'thinking about ' } }] }));
    setTimeout(() => res.write(chunk({ choices: [{ delta: { reasoning_content: 'the answer. ' } }] })), 20);
    setTimeout(() => res.write('data: {"choices":[{"delta":{"content":"The cu'), 60);
    setTimeout(() => res.write('stom provider works."}}]}\n\n'), 90);
    // a tool call whose arguments arrive in two fragments, MiMo/OpenAI shape
    setTimeout(() => res.write(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'pick_color', arguments: '{"hue":' } }] } }] })), 105);
    setTimeout(() => res.write(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"blue"}' } }] }, finish_reason: 'tool_calls' }] })), 125);
    setTimeout(() => res.write(chunk({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } })), 140);
    setTimeout(() => res.end('data: [DONE]\n\n'), 170);
  });
});
await new Promise(r => mock.listen(0, '127.0.0.1', r));
const MOCK_URL = `http://127.0.0.1:${mock.address().port}/v1`;
evidence.mockUrl = MOCK_URL;

// ---- Xvfb + Electron -------------------------------------------------------
const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1440x960x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const app = await electron.launch({
  executablePath: ELECTRON,
  args: [REPO, '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, DISPLAY: ':99', OPENSHADOW_SMOKE: '1' },
});
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.waitForLoadState('domcontentloaded');

// 1. opening animation, staged
const shots = [
  ['splash-0250ms', 250], ['splash-0900ms', 650], ['splash-1600ms', 700], ['app-idle', 1800],
];
let last = 0;
for (const [name, delay] of shots) {
  await page.waitForTimeout(delay - last); last = delay;
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}
step('app boots without page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'no page errors');

// 2. the new orb element renders real geometry
const orb = await page.evaluate(() => {
  const el = document.querySelector('shadow-orb');
  if (!el) return { found: false };
  const root = el.shadowRoot || el;
  return {
    found: true,
    tag: el.tagName.toLowerCase(),
    state: el.getAttribute('state'),
    circles: root.querySelectorAll('circle').length,
    paths: root.querySelectorAll('path').length,
    legs: root.querySelectorAll('line,rect').length,
    svg: !!root.querySelector('svg'),
    title: document.title,
  };
});
step('shadow-orb renders (svg + geometry)', orb.found && orb.svg && orb.circles >= 3, JSON.stringify(orb));
step('window title rebranded', orb.title === 'Open Shadow', orb.title);

// 3. the real bridge reports the whole provider registry
const providers = await page.evaluate(() => window.openshadow.llm.providers());
const ids = providers.map(p => p.id);
const expected = ['deepseek', 'openai', 'chatgpt', 'anthropic', 'mimo', 'moonshot', 'qwen', 'groq', 'openrouter', 'xai', 'gemini', 'custom'];
evidence.providers = providers;
step('bridge llm.providers() lists the registry', expected.every(id => ids.includes(id)), ids.join(','));

// 4. renderer -> main -> adapter -> HTTP, for a NEW provider, through the real IPC path
const models = (await page.evaluate(url => window.openshadow.llm.models('custom', 'sk-test-key', url), MOCK_URL)).models;
step('custom provider model list via mock /v1/models', Array.isArray(models) && models.includes('mimo-v2.6-pro') && models.length === 3, JSON.stringify(models));

// 5. streaming chat through the app's own llm:start path, events over IPC
const stream = await page.evaluate(async url => {
  const events = [];
  window.openshadow.llm.onEvent(event => events.push(event));
  window.openshadow.llm.start('smoke-1', {
    provider: 'custom',
    apiUrl: url,
    key: 'sk-test-key',
    model: 'mimo-v2.6-pro',
    messages: [{ role: 'user', content: 'ping' }],
    tools: [],
    maxTokens: 64,
  });
  await new Promise(r => setTimeout(r, 3000));
  const payload = type => events.filter(e => e.type === type);
  const text = payload('content').map(e => e.delta).join('');
  const reasoning = payload('reasoning').map(e => e.delta).join('');
  const calls = payload('tool_call');
  const joined = calls.map(e => e.arguments || '').join('');
  return {
    count: events.length,
    types: [...new Set(events.map(e => e.type))],
    text, reasoning,
    callName: calls.find(e => e.name)?.name || '',
    callArgs: joined,
    usage: (events.find(e => e.type === 'done') || {}).result?.usage || null,
    done: events.some(e => e.type === 'done'),
    error: events.find(e => e.type === 'error') || null,
  };
}, MOCK_URL);
evidence.stream = stream;
step('streamed reply text over IPC', stream.text.includes('custom provider works'), JSON.stringify({ text: stream.text, types: stream.types }));
step('reasoning_content surfaced', stream.reasoning.includes('the answer'), JSON.stringify(stream.reasoning));
step('tool call fragmented across chunks reassembled', stream.callName === 'pick_color' && stream.callArgs === '{"hue":"blue"}', `${stream.callName} ${stream.callArgs}`);
step('token usage surfaced', !!stream.usage && stream.usage.total_tokens === 18, JSON.stringify(stream.usage));
step('stream completed without error', stream.done && !stream.error, JSON.stringify(stream.error));

// 6. what the mock server actually received
const post = evidence.received.find(r => r.method === 'POST');
step('mock server saw POST {apiUrl}/chat/completions', !!post && post.url === '/v1/chat/completions', post ? post.url : 'no POST');
step('Authorization: Bearer passed through', !!post && post.auth === 'Bearer sk-test-key', post ? post.auth : 'none');
step('body carries model + messages', !!post && post.body.model === 'mimo-v2.6-pro' && JSON.stringify(post.body.messages[0].content).includes('ping') && post.body.stream === true, JSON.stringify(post && post.body));

await page.screenshot({ path: path.join(OUT, 'app-after-chat.png') });
evidence.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));

await app.close();
mock.close();
xvfb.kill();
const failed = evidence.steps.filter(s => !s.ok);
console.log(`\n${evidence.steps.length - failed.length}/${evidence.steps.length} checks passed`);
process.exit(failed.length ? 1 : 0);
