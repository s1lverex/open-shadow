// Cursor + built-in browser test, with the panel actually open.
// Launches the REAL Electron app (headless, Xvfb), opens a local target page in the
// built-in browser, and verifies the agent cursor overlay end to end.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const REPO = process.env.REPO || path.resolve(import.meta.dirname, '../..');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'openshadow-e2e');
const ELECTRON = path.join(REPO, 'node_modules/electron/dist/electron');
const PROJECT = process.env.PROJECT_DIR || path.join(import.meta.dirname, 'shot-project');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROJECT, { recursive: true });
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.error('DEEPSEEK_API_KEY required'); process.exit(2); }

const hits = [];
const PAGE = `<!doctype html><meta charset=utf-8><title>Open Shadow target</title>
<style>body{font:16px system-ui;background:#101014;color:#eee;padding:40px}
button{font-size:20px;padding:14px 28px;border-radius:10px} #out{margin-top:24px;color:#8b7cf6}</style>
<h1>Target page</h1><p>A small local page for the agent to drive.</p>
<button id=go onclick="document.getElementById('out').textContent='CLICK LANDED';fetch('/clicked')">Launch</button>
<div id=out></div>`;
const server = http.createServer((req, res) => {
  hits.push({ url: req.url, at: Date.now() });
  if (req.url.startsWith('/clicked')) { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(PAGE);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const xvfb = spawn('Xvfb', [':98', '-screen', '0', '1400x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const app = await electron.launch({ executablePath: ELECTRON, args: [REPO, '--no-sandbox', '--disable-gpu'], env: { ...process.env, DISPLAY: ':98' } });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await app.evaluate(async ({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, PROJECT);
await page.evaluate(key => { localStorage.setItem('deepseek.apiKey', key); localStorage.setItem('openshadow.mode', 'full'); }, KEY);
await page.reload();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(4200);
await page.evaluate(() => document.querySelector('button.composer-folder')?.click?.());
await page.click('button.composer-folder').catch(() => {});
await page.waitForTimeout(2000);

const evidence = { steps: [] };
const step = (name, ok, detail) => { evidence.steps.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${String(detail).slice(0, 170)}`); };
const say = async text => {
  await page.click('textarea.composer-input');
  await page.type('textarea.composer-input', text, { delay: 8 });
  await page.press('textarea.composer-input', 'Enter');
};
const waitFor = async (predicate, ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (predicate()) return true; await new Promise(r => setTimeout(r, 400)); }
  return false;
};

// Turn 1 — open the page so a browser tab exists.
await say(`Open ${BASE}/ in the built-in browser. Just say done.`);
const loaded = await waitFor(() => hits.some(h => h.url === '/' || h.url.startsWith('/?')), 60000);
step('model opens the built-in browser (target server saw the request)', loaded, hits.map(h => h.url).join(' '));

// Open the panel itself, the way the user does. The toggle only appears once a tab exists,
// so retry until the app reports the panel open (activate() toggles, so only call it closed).
const isOpen = () => page.evaluate(() => document.querySelector('.app')?.classList.contains('is-browser-open'));
for (let i = 0; i < 20 && !(await isOpen()); i++) {
  await page.evaluate(() => document.querySelector('browser-toggle')?.activate?.()).catch(() => {});
  await page.waitForTimeout(600);
}
const openState = await page.evaluate(() => {
  const app = document.querySelector('.app');
  const stage = document.querySelector('.browser-stage');
  const box = stage?.getBoundingClientRect();
  return { isBrowserOpen: app.classList.contains('is-browser-open'), stage: box ? [Math.round(box.width), Math.round(box.height)] : null };
});
evidence.panel = openState;
step('browser panel opens and the stage is laid out', openState.isBrowserOpen && openState.stage && openState.stage[0] > 200, JSON.stringify(openState));

// Turn 2 — click, while watching the cursor overlay.
const seen = { shown: false, arrow: null, translate: '', shot: null };
const watcher = (async () => {
  const until = Date.now() + 75000;
  while (Date.now() < until) {
    const state = await page.evaluate(() => {
      const cursor = document.querySelector('.browser-cursor');
      const img = document.querySelector('.browser-cursor-arrow');
      const badge = document.querySelector('.browser-agent');
      return {
        shown: !!cursor && cursor.classList.contains('is-shown'),
        arrow: img ? img.naturalWidth : null,
        translate: cursor?.style?.translate || '',
        badge: badge ? getComputedStyle(badge).opacity : null,
      };
    }).catch(() => null);
    if (state) {
      if (state.badge && state.badge !== '0') seen.badge = state.badge;
      if (state.shown) {
        seen.shown = true; seen.arrow = state.arrow; seen.translate = state.translate;
        if (!seen.shot) {
          seen.shot = path.join(OUT, 'agent-cursor.png');
          await page.locator('.browser-stage').screenshot({ path: seen.shot }).catch(() => {});
        }
      }
    }
    await new Promise(r => setTimeout(r, 100));
  }
})();
await say('Now click the Launch button on that page. Then say what the page shows.');
const clicked = await waitFor(() => hits.some(h => h.url.startsWith('/clicked')), 75000);
await watcher;
evidence.cursor = seen;
step('model-driven click lands on the page', clicked, hits.map(h => h.url).join(' '));
step('agent cursor overlay becomes visible', seen.shown, JSON.stringify({ shown: seen.shown, translate: seen.translate }));
step('cursor arrow image actually loads', seen.arrow > 0, String(seen.arrow));
step('agent "driving" badge shows during the turn', !!(seen.badge && seen.badge !== '0'), String(seen.badge));

await page.screenshot({ path: path.join(OUT, 'browser-open.png') });
evidence.hits = hits.map(h => h.url);
fs.writeFileSync(path.join(OUT, 'browser-cursor-evidence.json'), JSON.stringify(evidence, null, 1));
console.log(`\n${evidence.steps.filter(s => s.ok).length}/${evidence.steps.length} checks passed`);
await app.close(); server.close(); xvfb.kill();
