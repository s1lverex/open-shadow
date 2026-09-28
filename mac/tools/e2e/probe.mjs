// Probe the settled app state: is the splash gone, does the empty-chat screen render its orb?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const REPO = process.env.REPO || path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'shots');
const ELECTRON = path.join(REPO, 'node_modules/electron/dist/electron');

const xvfb = spawn('Xvfb', [':97', '-screen', '0', '1440x960x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const app = await electron.launch({
  executablePath: ELECTRON,
  args: [REPO, '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, DISPLAY: ':97' },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');

const probe = () => page.evaluate(() => {
  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), display: cs.display, opacity: +cs.opacity, visibility: cs.visibility };
  };
  const orb = document.querySelector('shadow-orb');
  const orbRoot = orb && (orb.shadowRoot || orb);
  const orbBox = orb ? orb.getBoundingClientRect() : null;
  return {
    rootClasses: document.documentElement.className,
    splash: box('.splash'),
    splashOrb: box('.splash-orb'),
    wordmark: document.querySelector('.splash-word')?.textContent,
    composer: box('.composer-input'),
    welcome: box('welcome-shadow'),
    orb: orb ? { w: Math.round(orbBox.width), h: Math.round(orbBox.height), x: Math.round(orbBox.x), y: Math.round(orbBox.y), state: orb.getAttribute('state'), circles: orbRoot.querySelectorAll('circle').length, bodyH: orbRoot.querySelector('svg')?.getBoundingClientRect().height } : null,
    chatRoot: box('#chat') || box('.chat') || null,
    visibleTopLevel: [...document.body.children].filter(el => el.getBoundingClientRect().height > 40).map(el => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40)),
  };
});

const stages = [];
for (const t of [300, 1500, 2600, 4000, 7000]) {
  await page.waitForTimeout(t - (stages.at(-1)?.t || 0));
  stages.push({ t, ...(await probe()) });
  await page.screenshot({ path: path.join(OUT, `probe-${t}ms.png`) });
}
console.log(JSON.stringify(stages, null, 1));
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(stages, null, 1));
await app.close();
xvfb.kill();
