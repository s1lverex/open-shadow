import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TREES = ['', 'linux', 'mac'];
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const BINARY = /\.(?:png|ico|jpg|jpeg|gif|webp|bmp|woff2?|ttf|otf|icns)$/i;
// The upstream credit is intentionally kept in the licence and the READMEs (brief 30/45).
// package-lock.json is generated. The stale download-stub prefix in tools/sync-trees.mjs is
// tooling left over from the fork; brief 45 removes it but is not a prerequisite here.
const ALLOWED_OPENGHOST = rel =>
  rel === 'LICENSE' || rel.endsWith('/LICENSE') ||
  rel === 'README.md' || rel.endsWith('/README.md') ||
  rel === 'package-lock.json' || rel.endsWith('/package-lock.json') ||
  rel.startsWith('tests/') || rel.endsWith('tools/sync-trees.mjs');

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      if (dir === ROOT && (name === 'linux' || name === 'mac')) continue;
      walk(abs, out);
    } else if (stat.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

function findInFile(abs, needle) {
  const hits = [];
  for (const [index, line] of readFileSync(abs, 'utf8').split('\n').entries()) {
    if (needle.test(line)) hits.push(`${relative(ROOT, abs)}:${index + 1}: ${line.trim()}`);
  }
  return hits;
}

test('rebrand: no "OpenGhost" outside the allowed upstream-credit / generated files', () => {
  const offenders = [];
  for (const tree of TREES) {
    for (const abs of walk(join(ROOT, tree))) {
      const rel = relative(ROOT, abs).replaceAll('\\', '/');
      if (BINARY.test(rel) || ALLOWED_OPENGHOST(rel)) continue;
      offenders.push(...findInFile(abs, /openghost/i));
    }
  }
  assert.deepEqual(offenders, [], `OpenGhost leaked into:\n${offenders.join('\n')}`);
});

test('rebrand: index.html references no ghost artwork', () => {
  const offenders = [];
  for (const tree of TREES) {
    const file = join(ROOT, tree, 'index.html');
    assert.ok(existsSync(file), `missing ${relative(ROOT, file)}`);
    offenders.push(...findInFile(file, /(?:href|src)\s*=\s*["'][^"']*ghost[^"']*\.(?:ico|png)["']/i));
  }
  assert.deepEqual(offenders, [], `ghost artwork still referenced:\n${offenders.join('\n')}`);
});

test('rebrand: ghost elements are gone and shadow-orb.js exists in every tree', () => {
  for (const tree of TREES) {
    for (const stale of ['ghost-thinking.js', 'welcome-ghost.js']) {
      assert.ok(!existsSync(join(ROOT, tree, stale)), `stale element still present: ${relative(ROOT, join(ROOT, tree, stale))}`);
    }
    const orb = join(ROOT, tree, 'shadow-orb.js');
    assert.ok(existsSync(orb), `shadow-orb.js missing in ${relative(ROOT, orb) || '.'}`);
  }
});

test('rebrand: the original MIT copyright line is preserved in every LICENSE', () => {
  for (const tree of TREES) {
    const file = join(ROOT, tree, 'LICENSE');
    assert.ok(existsSync(file), `missing ${relative(ROOT, file)}`);
    assert.match(readFileSync(file, 'utf8'), /Copyright \(c\) 2026 Andrew/, `MIT copyright line missing from ${relative(ROOT, file)}`);
  }
});
