#!/usr/bin/env node
// Mirror the root (Windows) tree into linux/ and mac/.
// The six platform-specific files are never overwritten; everything else must be
// byte-identical across the three trees after a run.
import {
  readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync,
} from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['linux', 'mac'];
const CHECK = process.argv.includes('--check');

// Files the mirror must never touch. Each is platform specific and must differ
// between the trees (LICENSE is skipped because its fork notice is tree agnostic).
const SKIP = new Set([
  'package.json',
  'README.md',
  'agent-prompt.js',
  'agent-tools.js',
  'desktop/media.js',
  'desktop/tools.js',
]);

// Protected files that have to be platform specific: if any two trees share the
// same bytes the mirror would silently clobber a difference that should exist.
const MUST_DIFFER = ['package.json', 'README.md', 'agent-prompt.js', 'agent-tools.js', 'desktop/media.js', 'desktop/tools.js'];

const EXCLUDE_TOP = new Set(['.git', 'node_modules', 'tests', 'briefs', 'images', 'linux', 'mac']);
// Generated per-tree artifacts that intentionally have no root counterpart.
const KEEP_TARGET_ONLY = new Set(['icon.png']);
const isExcludedTop = (name) => EXCLUDE_TOP.has(name);

function walk(dir, base, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (dir === ROOT && isExcludedTop(name)) continue;
      walk(abs, base, out);
    } else if (st.isFile()) {
      out.push(relative(base, abs));
    }
  }
  return out;
}

function read(abs) {
  try { return readFileSync(abs); } catch { return null; }
}

function same(a, b) {
  const ab = read(a);
  const bb = read(b);
  return ab !== null && bb !== null && ab.equals(bb);
}

const rootFiles = walk(ROOT, ROOT);
const copies = [];
const removals = [];

for (const rel of rootFiles) {
  if (SKIP.has(rel)) continue;
  const src = join(ROOT, rel);
  for (const tree of TARGETS) {
    const dest = join(ROOT, tree, rel);
    if (same(src, dest)) continue;
    if (CHECK) {
      console.error(`drift: ${tree}/${rel}`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(src));
    copies.push(`${tree}/${rel}`);
    console.log(`+ ${tree}/${rel}`);
  }
}

for (const tree of TARGETS) {
  const treeRoot = join(ROOT, tree);
  if (!existsSync(treeRoot)) continue;
  for (const rel of walk(treeRoot, treeRoot)) {
    if (SKIP.has(rel)) continue;
    if (KEEP_TARGET_ONLY.has(rel)) continue;
    if (rootFiles.includes(rel)) continue;
    if (CHECK) {
      console.error(`stale: ${tree}/${rel}`);
      continue;
    }
    rmSync(join(treeRoot, rel));
    removals.push(`${tree}/${rel}`);
    console.log(`- ${tree}/${rel}`);
  }
}

// Fail loudly on drift that survives a run.
const errors = [];
for (const rel of MUST_DIFFER) {
  const files = [ROOT, ...TARGETS.map((t) => join(ROOT, t))].map((base) =>
    existsSync(join(base, rel)) ? { base, buf: readFileSync(join(base, rel)) } : null);
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      if (files[i] && files[j] && files[i].buf.equals(files[j].buf)) {
        errors.push(`protected file identical across trees: ${rel} (${files[i].base} == ${files[j].base})`);
      }
    }
  }
}
for (const rel of rootFiles) {
  if (SKIP.has(rel)) continue;
  for (const tree of TARGETS) {
    if (!same(join(ROOT, rel), join(ROOT, tree, rel))) {
      errors.push(`mirror out of sync: ${tree}/${rel}`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
if (CHECK) {
  console.log('trees in sync');
  process.exit(0);
}
if (!copies.length && !removals.length) {
  console.log('trees in sync (nothing to copy)');
}
