import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The six upstream OpenGhost screenshots that were removed from images/. These
// hashes were derived from the deleted blobs in HEAD:
//   git show HEAD:images/<name>.jpg | sha256sum
// (Every line in the brief matched the derived value.)
const BANNED = new Map([
  ['d43eed89d773d83bff4aa71d537b56ca1921ad07f17f665d8e7d8dd78421dc4b', 'browser.jpg'],
  ['a3a790e957e2e35ecbda0ca7156bc5b92b1a95ed60558e2c5198039ab520dc8', 'editor.jpg'],
  ['a143d697a40bf6bfeb2caca17857f71cfd402af701820a9a170bd466cf135513', 'mini.jpg'],
  ['c5d293e2f40b2deba26564215610359e920666af09ec3f93dd1d900e7f847846', 'modes.jpg'],
  ['d4b6cf24699fbc6a3ae334a8cf02660d7d48a42738099ead93f26b7a83d929cd', 'settings.jpg'],
  ['105d5fc51bfc737c86604b188247e18e2615eba49bf20731e1266dffc2784fb0', 'visual.jpg'],
]);

const KNOWN_PNG = new Set(['opening.png', 'home.png', 'providers.png', 'diagram.png', 'modes.png', 'settings.png']);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

test('images: no removed upstream screenshot bytes exist anywhere in the tree', () => {
  for (const abs of walk(ROOT)) {
    const digest = sha256(readFileSync(abs));
    const upstream = BANNED.get(digest);
    if (upstream) {
      assert.fail(`upstream screenshot bytes (${upstream}) still present at ${relative(ROOT, abs)}`);
    }
  }
});

function trackedReadmes() {
  const out = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function referencedImages(absReadme) {
  const text = readFileSync(absReadme, 'utf8');
  const refs = [];
  const re = /!?\[[^\]]*\]\(([^)]*images\/[^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) refs.push(m[1]);
  return refs;
}

test('images: every README image reference resolves to a real file', () => {
  const readmes = trackedReadmes();
  for (const rel of readmes) {
    const abs = join(ROOT, rel);
    for (const ref of referencedImages(abs)) {
      const target = resolve(dirname(abs), ref);
      assert.ok(existsSync(target), `${rel} references missing ${ref}`);
    }
  }
});

test('images: no two README-referenced images are byte-identical', () => {
  const targets = new Set();
  for (const rel of trackedReadmes()) {
    const abs = join(ROOT, rel);
    for (const ref of referencedImages(abs)) targets.add(resolve(dirname(abs), ref));
  }
  const seen = new Map();
  for (const target of targets) {
    if (!existsSync(target)) continue;
    const digest = sha256(readFileSync(target));
    if (seen.has(digest)) {
      assert.fail(`byte-identical images: ${seen.get(digest)} and ${relative(ROOT, target)}`);
    }
    seen.set(digest, relative(ROOT, target));
  }
});

test('images: only the six known PNGs live in images/', () => {
  const actual = readdirSync(join(ROOT, 'images')).filter((n) => !n.startsWith('.'));
  assert.deepEqual(actual.sort(), [...KNOWN_PNG].sort());
});
