'use strict';

// Streaming client for every OpenAI Chat Completions-compatible provider. The base URL always comes from the registry or the request.
const { text, parts } = require('./messages');

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

// The history is already Chat Completions-shaped; only pictures and the echoed MiMo reasoning need care.
function convert(messages, vision) {
 const out = [];
 for (const message of messages) {
  if (message.role === 'system') out.push({ role: 'system', content: text(message.content) });
  else if (message.role === 'tool') out.push({ role: 'tool', tool_call_id: message.tool_call_id, content: message.content || '' });
  else if (message.role === 'assistant') {
   const entry = { role: 'assistant', content: text(message.content) || '' };
   if (message.reasoning) entry.reasoning_content = message.reasoning;
   if (message.tool_calls?.length) entry.tool_calls = message.tool_calls;
   out.push(entry);
  } else out.push({ role: 'user', content: parts(message.content, vision, 'chat') });
 }
 return out;
}

async function failure(response) {
 let detail = '', code = '';
 try {
  const body = await response.json();
  detail = body.error?.message || body.message || '';
  code = body.error?.code || body.error?.type || '';
 } catch {}
 return error(detail || `Provider returned error ${response.status}`, response.status, code);
}

async function models({ key, apiUrl }) {
 const response = await fetch(`${apiUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
 if (!response.ok) throw await failure(response);
 const body = await response.json();
 return [...new Set((body.data || []).map(item => item.id))].sort();
}

// SSE blocks: comment/keep-alive lines drop out, data lines join, a payload split across reads stays in the buffer.
async function* events(body) {
 const decoder = new TextDecoder();
 let buffer = '';
 const parse = block => block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
 for await (const chunk of body) {
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  let at;
  while ((at = buffer.indexOf('\n\n')) >= 0) {
   const data = parse(buffer.slice(0, at));
   buffer = buffer.slice(at + 2);
   if (data && data !== '[DONE]') yield JSON.parse(data);
  }
 }
 const data = parse(buffer);
 if (data && data !== '[DONE]') yield JSON.parse(data);
}

async function stream(request, context) {
 const { model, key, messages, tools, maxTokens, vision = true } = request;
 const { signal, onEvent = () => {}, apiUrl } = context;
 const body = { model, messages: convert(messages, vision), stream: true, max_tokens: maxTokens, stream_options: { include_usage: true } };
 if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
 let response;
 try {
  response = await fetch(`${apiUrl}/chat/completions`, {
   method: 'POST', signal,
   headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
   body: JSON.stringify(body),
  });
 } catch (cause) {
  if (cause.name === 'AbortError') throw cause;
  throw error('network', 0, 'network');
 }
 if (!response.ok) throw await failure(response);
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 const calls = new Map();
 for await (const event of events(response.body)) {
  const choice = event.choices?.[0];
  if (choice) {
   const delta = choice.delta || {};
   if (delta.content) { result.content += delta.content; onEvent({ type: 'content', delta: delta.content }); }
   const reasoning = delta.reasoning_content ?? delta.reasoning;
   if (reasoning) { result.reasoning += reasoning; onEvent({ type: 'reasoning', delta: reasoning }); }
   for (const call of delta.tool_calls || []) {
    const index = call.index ?? 0;
    const current = calls.get(index) || { id: '', name: '', arguments: '' };
    if (call.id) current.id = call.id;
    if (call.function?.name) current.name = call.function.name;
    if (call.function?.arguments) current.arguments += call.function.arguments;
    calls.set(index, current);
    onEvent({ type: 'tool_call', index, id: call.id, name: call.function?.name, arguments: call.function?.arguments });
   }
   if (choice.finish_reason) result.finishReason = choice.finish_reason;
  }
  if (event.usage) result.usage = { prompt_tokens: event.usage.prompt_tokens || 0, completion_tokens: event.usage.completion_tokens || 0, total_tokens: event.usage.total_tokens || 0 };
 }
 result.toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }));
 if (!result.finishReason) result.finishReason = result.toolCalls.length ? 'tool_calls' : 'stop';
 return result;
}

module.exports = { models, stream, convert };
