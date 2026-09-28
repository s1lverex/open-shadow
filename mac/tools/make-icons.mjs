// Renders desktop/icon.svg with headless Chromium and writes the PNG/ICO icon set.
// No external dependencies: Chromium draws the SVG, this script builds the ICO container by hand.
//   CHROME_PATH=/path/to/chrome node tools/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH
  || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const SVG = readFileSync(join(ROOT, 'desktop/icon.svg'), 'utf8');

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

function render(size, out, pageDir) {
  const svg = SVG.replace('<svg ', `<svg width="${size}" height="${size}" `);
  const page = join(pageDir, `icon-${size}.html`);
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>`
    + `html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}`
    + `svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ], { stdio: 'ignore' });
}

// PNG frames in a hand-written ICO container: 6-byte header, 16-byte directory entries, then payloads.
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + dir.length;
  frames.forEach(({ size, data }, i) => {
    const entry = dir.subarray(i * 16, i * 16 + 16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...frames.map(frame => frame.data)]);
}

const scratch = mkdtempSync(join(tmpdir(), 'openshadow-icons-'));
try {
  const frames = ICO_SIZES.map(size => {
    const out = join(scratch, `icon-${size}.png`);
    render(size, out, scratch);
    console.log(`rendered ${size}x${size}`);
    return { size, data: readFileSync(out) };
  });

  render(512, join(ROOT, 'desktop/icon.png'), scratch);
  writeFileSync(join(ROOT, 'desktop/icon.ico'), buildIco(frames));
  console.log(`wrote desktop/icon.png (512) and desktop/icon.ico (${ICO_SIZES.join(', ')})`);

  mkdirSync(join(ROOT, 'linux'), { recursive: true });
  mkdirSync(join(ROOT, 'mac'), { recursive: true });
  copyFileSync(join(ROOT, 'desktop/icon.png'), join(ROOT, 'linux/icon.png'));
  copyFileSync(join(ROOT, 'desktop/icon.png'), join(ROOT, 'mac/icon.png'));
  console.log('copied 512 PNG to linux/icon.png and mac/icon.png');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
