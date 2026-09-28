import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = require(join(ROOT, 'desktop', 'providers.js'));
const chat = require(join(ROOT, 'desktop', 'chatcompletions.js'));

test('registry: ids are unique and round-trip through get()/has()', () => {
  const all = registry.list();
  assert.ok(all.length > 0, 'registry is empty');
  const ids = all.map(provider => provider.id);
  assert.deepEqual(ids, [...new Set(ids)], 'duplicate provider id in registry');
  for (const provider of all) {
    assert.equal(registry.has(provider.id), true, `has(${provider.id})`);
    assert.equal(registry.get(provider.id), provider, `get(${provider.id}) returns a different object`);
  }
});

test('registry: every chat provider has a label, an apiUrl and a keyPlaceholder', () => {
  const chats = registry.list().filter(provider => provider.kind === 'chat');
  assert.ok(chats.length >= 8, `expected the new chat providers, found ${chats.length}`);
  for (const provider of chats) {
    assert.ok(provider.label && provider.label.trim(), `${provider.id}: empty label`);
    if (provider.id === 'custom') {
      // The custom endpoint is user-entered, so the registry ships it empty on purpose.
      assert.equal(provider.apiUrl, '', 'custom apiUrl must be empty (user-entered)');
    } else {
      assert.ok(provider.apiUrl && /^https?:\/\//.test(provider.apiUrl), `${provider.id}: bad apiUrl "${provider.apiUrl}"`);
    }
    assert.ok(provider.keyPlaceholder && provider.keyPlaceholder.trim(), `${provider.id}: empty keyPlaceholder`);
  }
});

test('registry: shipped providers point at their documented endpoints', () => {
  const endpoints = [
    ['mimo', 'https://api.xiaomimimo.com/v1'],
    ['moonshot', 'https://api.moonshot.cn/v1'],
    ['qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
    ['groq', 'https://api.groq.com/openai/v1'],
    ['openrouter', 'https://openrouter.ai/api/v1'],
    ['xai', 'https://api.x.ai/v1'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    ['openai', 'https://api.openai.com/v1'],
    ['anthropic', 'https://api.anthropic.com'],
    ['deepseek', 'https://api.deepseek.com/v1'],
  ];
  for (const [id, url] of endpoints) {
    const provider = registry.get(id);
    assert.ok(provider, `unknown provider "${id}"`);
    assert.equal(provider.apiUrl, url, `${id}: apiUrl should be "${url}", got "${provider.apiUrl}"`);
  }
});

test('registry: MiMo ships its documented models', () => {
  const mimo = registry.get('mimo');
  assert.ok(mimo, 'mimo provider is missing');
  const ids = mimo.models.map(model => model.id);
  for (const id of ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed', 'mimo-v2.5-pro', 'mimo-v2.5']) {
    assert.ok(ids.includes(id), `mimo models are missing "${id}" (got ${ids.join(', ')})`);
  }
  for (const model of mimo.models) {
    assert.ok(model.id && model.id.trim(), `mimo model with empty id: ${JSON.stringify(model)}`);
    assert.ok(model.name && model.name.trim(), `${model.id}: empty name`);
  }
  const noVision = mimo.models.filter(model => model.vision === false).map(model => model.id);
  assert.deepEqual(noVision, ['mimo-v2.5-pro'], `only mimo-v2.5-pro should have vision === false (got ${noVision.join(', ')})`);
});

test('registry: no apiUrl carries a trailing slash', () => {
  for (const provider of registry.list()) {
    if (provider.apiUrl) {
      assert.ok(!provider.apiUrl.endsWith('/'), `${provider.id}: apiUrl must not end with a slash ("${provider.apiUrl}")`);
    }
  }
});

test('renderer providers.js: NAMES maps every registry id', () => {
  const source = readFileSync(join(ROOT, 'providers.js'), 'utf8');
  const block = source.match(/const NAMES\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(block, 'const NAMES block not found in providers.js');
  const names = new Set([...block[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)].map(match => match[1]));
  for (const provider of registry.list()) {
    assert.ok(names.has(provider.id), `renderer NAMES is missing "${provider.id}"`);
  }
});

test('chatcompletions: stream() uses a caller-supplied apiUrl', async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {"choices":[{"delta":{"content":"local"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const result = await chat.stream(
      { model: 'custom-model', key: 'test-key', messages: [{ role: 'user', content: 'hi' }], maxTokens: 8 },
      { apiUrl: `http://127.0.0.1:${port}`, onEvent: () => {} },
    );
    assert.equal(result.content, 'local');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
