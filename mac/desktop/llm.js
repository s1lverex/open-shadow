'use strict';

// Requests to every provider run here in the main process: the Codex backend and the ChatGPT sign-in are out of reach of the page.
// The page starts a run by id and gets its deltas, then the result or the error, back as events.
const { app, ipcMain } = require('electron');
const providers = require('./providers');
const OpenAI = require('./openai');
const Claude = require('./anthropic');
const Chat = require('./chatcompletions');
const ChatGPT = require('./chatgpt');

const runs = new Map();
const PROVIDERS = { has: id => providers.has(id) };

const engine = id => {
 const kind = providers.get(id)?.kind;
 if (kind === 'inpage') throw new Error(`Unknown provider: ${id}`);
 if (kind === 'anthropic-sdk') return Claude;
 if (kind === 'chat') return Chat;
 return OpenAI;
};

async function start(sender, id, request) {
 const controller = new AbortController();
 runs.set(id, controller);
 const send = data => { if (!sender.isDestroyed()) sender.send('llm:event', { id, ...data }); };
 try {
  const provider = providers.get(request?.provider);
  if (!provider) throw new Error('Unknown provider');
  const apiUrl = request.apiUrl || provider.apiUrl;
  const result = await engine(request.provider).stream(request, {
   signal: controller.signal,
   onEvent: send,
   apiUrl,
   baseURL: apiUrl,
   chatgpt: ChatGPT.credentials,
   version: app.getVersion(),
  });
  send({ type: 'done', result });
 } catch (error) {
  const aborted = controller.signal.aborted || error.name === 'AbortError';
  send({ type: 'error', aborted, status: error.status || 0, code: error.code || '', message: aborted ? '' : error.message });
 } finally {
  runs.delete(id);
 }
}

function register(fromApp) {
 ipcMain.on('llm:start', (event, id, request) => { if (fromApp(event)) start(event.sender, id, request); });
 ipcMain.on('llm:abort', (event, id) => { if (fromApp(event)) runs.get(id)?.abort(); });
 ipcMain.handle('llm:models', async (event, provider, key, apiUrl) => {
  if (!fromApp(event) || !PROVIDERS.has(provider)) return { models: [] };
  const url = apiUrl || providers.get(provider).apiUrl;
  try {
   return { models: await engine(provider).models({ provider, key, apiUrl: url, baseURL: url }) };
  } catch (error) {
   return { error: { status: error.status || 0, code: error.code || '', message: error.message } };
  }
 });
 ipcMain.handle('llm:providers', event => { if (!fromApp(event)) return []; return providers.list(); });
 const auth = action => async event => {
  if (!fromApp(event)) return { connected: false };
  try {
   return await action();
  } catch (error) {
   return { ...(await ChatGPT.status()), error: error.message };
  }
 };
 ipcMain.handle('auth:login', auth(() => ChatGPT.login()));
 ipcMain.handle('auth:logout', auth(() => ChatGPT.logout()));
 ipcMain.handle('auth:status', auth(() => ChatGPT.status()));
 ipcMain.handle('auth:cancel', auth(async () => { ChatGPT.cancel(); return ChatGPT.status(); }));
}

function cancelAll() {
 for (const controller of runs.values()) controller.abort();
 ChatGPT.cancel();
}

module.exports = { register, cancelAll };
