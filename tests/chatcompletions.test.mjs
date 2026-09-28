import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { stream } = require(join(ROOT, 'desktop', 'chatcompletions.js'));

// A real HTTP server on an ephemeral port. Every request it receives is recorded so a test can
// assert on the method, URL, headers and parsed body that actually went over the wire.
function mock(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const record = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        raw,
        body: raw ? JSON.parse(raw) : null,
      };
      requests.push(record);
      handler(req, res, record);
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      requests,
      apiUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

const write = (res, payload) => res.write(`data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`);

async function run(server, overrides = {}) {
  const events = [];
  const result = await stream(
    { model: 'test-model', key: 'test-key', messages: [{ role: 'user', content: 'hello' }], maxTokens: 128, ...overrides },
    { apiUrl: server.apiUrl, onEvent: event => events.push(event) },
  );
  return { result, events };
}

test('happy path: correct request and a JSON payload split across writes', async () => {
  const server = await mock((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"Hel');
    res.write('lo "}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"world"}}]}\n\n');
    write(res, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } });
    write(res, '[DONE]');
    res.end();
  });
  try {
    const { result, events } = await run(server);

    const request = server.requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer test-key');
    assert.match(request.headers['content-type'] || '', /^application\/json/);
    assert.equal(request.body.stream, true);
    assert.equal(request.body.model, 'test-model');
    assert.equal(request.body.max_tokens, 128);
    assert.deepEqual(request.body.stream_options, { include_usage: true });
    assert.ok(Array.isArray(request.body.messages), 'messages missing from request');

    assert.equal(result.content, 'Hello world');
    assert.equal(result.reasoning, '');
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
    assert.deepEqual(events, [
      { type: 'content', delta: 'Hello ' },
      { type: 'content', delta: 'world' },
    ]);
  } finally {
    await server.close();
  }
});

test('MiMo shape: reasoning, then content, then a tool call with arguments in two fragments', async () => {
  const server = await mock((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    write(res, { choices: [{ delta: { reasoning_content: 'Let me think' } }] });
    write(res, { choices: [{ delta: { content: 'Checking' } }] });
    write(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"ci' } }] } }] });
    write(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ty":"Paris"}' } }] } }] });
    write(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 } });
    write(res, '[DONE]');
    res.end();
  });
  try {
    const { result, events } = await run(server, {
      tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
    });

    assert.equal(result.reasoning, 'Let me think');
    assert.equal(result.content, 'Checking');
    assert.equal(result.finishReason, 'tool_calls');
    assert.deepEqual(result.toolCalls, [{
      id: 'call_1',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
    }]);

    assert.deepEqual(events.map(event => event.type), ['reasoning', 'content', 'tool_call', 'tool_call']);
    assert.equal(events[0].delta, 'Let me think');
    assert.equal(events[1].delta, 'Checking');
    assert.equal(events[2].arguments, '{"ci');
    assert.equal(events[3].arguments, 'ty":"Paris"}');
    assert.equal(server.requests[0].body.tools.length, 1, 'tools were not forwarded');
  } finally {
    await server.close();
  }
});

test('usage: a mid-stream usage chunk is recorded', async () => {
  const server = await mock((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    write(res, { choices: [{ delta: { content: 'a' } }] });
    write(res, { choices: [], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
    write(res, { choices: [{ delta: { content: 'b' } }] });
    write(res, '[DONE]');
    res.end();
  });
  try {
    const { result } = await run(server);
    assert.equal(result.content, 'ab');
    assert.deepEqual(result.usage, { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 });
  } finally {
    await server.close();
  }
});

test('usage: a provider that omits usage resolves with usage null', async () => {
  const server = await mock((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    write(res, { choices: [{ delta: { content: 'no usage here' }, finish_reason: 'stop' }] });
    write(res, '[DONE]');
    res.end();
  });
  try {
    const { result } = await run(server);
    assert.equal(result.content, 'no usage here');
    assert.equal(result.usage, null);
  } finally {
    await server.close();
  }
});

test('HTTP 401: thrown error carries status 401', async () => {
  const server = await mock((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'bad key', code: 'invalid_api_key' } }));
  });
  try {
    await assert.rejects(run(server), error => {
      assert.equal(error.status, 401);
      assert.equal(error.code, 'invalid_api_key');
      return true;
    });
  } finally {
    await server.close();
  }
});

test('[DONE] ends the stream exactly once and is never emitted as an event', async () => {
  const server = await mock((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    write(res, { choices: [{ delta: { content: 'done-ok' }, finish_reason: 'stop' }] });
    write(res, '[DONE]');
    write(res, '[DONE]');
    res.end();
  });
  try {
    let settlements = 0;
    const events = [];
    const result = await stream(
      { model: 'test-model', key: 'test-key', messages: [{ role: 'user', content: 'hi' }], maxTokens: 16 },
      { apiUrl: server.apiUrl, onEvent: event => events.push(event) },
    ).then(value => { settlements += 1; return value; });

    assert.equal(settlements, 1, 'stream settled more than once');
    assert.equal(result.content, 'done-ok');
    assert.deepEqual(events.map(event => event.type), ['content']);
    assert.ok(!events.some(event => event.type === 'done'), 'a DONE marker leaked into the events');
  } finally {
    await server.close();
  }
});
