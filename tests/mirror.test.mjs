import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TREES = ['linux', 'mac'];
// Contract §5: only these files may legitimately differ between the three trees.
const PROTECTED = new Set([
  'agent-prompt.js',
  'agent-tools.js',
  'desktop/media.js',
  'desktop/tools.js',
  'package.json',
  'README.md',
]);
// Root-only trees/artifacts that are not part of the mirrored app source.
const ROOT_SKIP = new Set(['.git', 'node_modules', 'tests', 'briefs', 'images', 'linux', 'mac', 'dist']);

function walk(dir, base, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (dir === ROOT && ROOT_SKIP.has(name)) continue;
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) walk(abs, base, out);
    else if (stat.isFile()) out.push(relative(base, abs).replaceAll('\\', '/'));
  }
  return out;
}

const files = walk(ROOT, ROOT);

test('mirror: every root file exists in linux/ and mac/', () => {
  for (const file of files) {
    for (const tree of TREES) {
      const target = join(ROOT, tree, file);
      assert.ok(existsSync(target), `missing ${tree}/${file}`);
    }
  }
});

test('mirror: everything outside the protected set is byte-identical across the trees', () => {
  for (const file of files) {
    if (PROTECTED.has(file)) continue;
    const reference = readFileSync(join(ROOT, file));
    for (const tree of TREES) {
      const candidate = readFileSync(join(ROOT, tree, file));
      assert.ok(reference.equals(candidate), `drift in ${tree}/${file}`);
    }
  }
});

test('mirror: the protected platform files are present in all three trees', () => {
  for (const file of PROTECTED) {
    for (const base of [ROOT, ...TREES.map(tree => join(ROOT, tree))]) {
      assert.ok(existsSync(join(base, file)), `missing ${relative(ROOT, join(base, file))}`);
    }
  }
});
