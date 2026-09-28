'use strict';

// One registry for every provider the app knows: what it is, where it points, and how to get a key.
const PROVIDERS = {
 deepseek: {
  id: 'deepseek', label: 'DeepSeek', kind: 'inpage',
  apiUrl: 'https://api.deepseek.com/v1',
  keyUrl: 'https://platform.deepseek.com/api_keys', keyHost: 'platform.deepseek.com',
  keyPlaceholder: 'sk-…', docsUrl: 'https://api-docs.deepseek.com',
  models: [], visionHint: 'Pictures are supported.',
 },
 openai: {
  id: 'openai', label: 'OpenAI', kind: 'responses',
  apiUrl: 'https://api.openai.com/v1',
  keyUrl: 'https://platform.openai.com/api-keys', keyHost: 'platform.openai.com',
  keyPlaceholder: 'sk-…', docsUrl: 'https://platform.openai.com/docs',
  models: [], visionHint: 'Pictures are supported.',
 },
 chatgpt: {
  id: 'chatgpt', label: 'ChatGPT', kind: 'codex',
  apiUrl: 'https://chatgpt.com/backend-api/codex/responses',
  keyUrl: null, keyHost: null,
  keyPlaceholder: null, docsUrl: null,
  models: [], visionHint: null,
 },
 anthropic: {
  id: 'anthropic', label: 'Anthropic', kind: 'anthropic-sdk',
  apiUrl: 'https://api.anthropic.com',
  keyUrl: 'https://console.anthropic.com/settings/keys', keyHost: 'console.anthropic.com',
  keyPlaceholder: 'sk-ant-…', docsUrl: 'https://docs.anthropic.com',
  models: [], visionHint: 'Pictures are supported.',
 },
 mimo: {
  id: 'mimo', label: 'Xiaomi MiMo', kind: 'chat',
  apiUrl: 'https://api.xiaomimimo.com/v1',
  keyUrl: 'https://platform.xiaomimimo.com', keyHost: 'platform.xiaomimimo.com',
  keyPlaceholder: 'sk-…', docsUrl: 'https://platform.xiaomimimo.com/#/docs',
  models: [
   { id: 'mimo-v2.6-pro', name: 'MiMo-V2.6-Pro', vision: true },
   { id: 'mimo-v2.6-flash', name: 'MiMo-V2.6-Flash', vision: true },
   { id: 'mimo-v2.6-pro-ultraspeed', name: 'MiMo-V2.6-Pro-Ultraspeed', vision: true },
   { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5-Pro', vision: false },
   { id: 'mimo-v2.5', name: 'MiMo-V2.5', vision: true },
  ],
  visionHint: 'Pictures work on every MiMo model except mimo-v2.5-pro.',
 },
 moonshot: {
  id: 'moonshot', label: 'Moonshot Kimi', kind: 'chat',
  apiUrl: 'https://api.moonshot.cn/v1',
  keyUrl: 'https://platform.moonshot.cn/console/api-keys', keyHost: 'platform.moonshot.cn',
  keyPlaceholder: 'sk-…', docsUrl: 'https://platform.moonshot.cn/docs',
  models: [], visionHint: 'Kimi models accept pictures.',
 },
 qwen: {
  id: 'qwen', label: 'Qwen (DashScope)', kind: 'chat',
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  keyUrl: 'https://bailian.console.aliyun.com/', keyHost: 'bailian.console.aliyun.com',
  keyPlaceholder: 'sk-…', docsUrl: 'https://help.aliyun.com/zh/model-studio/',
  models: [], visionHint: 'Qwen models accept pictures.',
 },
 groq: {
  id: 'groq', label: 'Groq', kind: 'chat',
  apiUrl: 'https://api.groq.com/openai/v1',
  keyUrl: 'https://console.groq.com/keys', keyHost: 'console.groq.com',
  keyPlaceholder: 'gsk_…', docsUrl: 'https://console.groq.com/docs',
  models: [], visionHint: 'Vision depends on the Groq model.',
 },
 openrouter: {
  id: 'openrouter', label: 'OpenRouter', kind: 'chat',
  apiUrl: 'https://openrouter.ai/api/v1',
  keyUrl: 'https://openrouter.ai/keys', keyHost: 'openrouter.ai',
  keyPlaceholder: 'sk-or-…', docsUrl: 'https://openrouter.ai/docs',
  models: [], visionHint: 'Vision depends on the chosen model.',
 },
 xai: {
  id: 'xai', label: 'xAI Grok', kind: 'chat',
  apiUrl: 'https://api.x.ai/v1',
  keyUrl: 'https://console.x.ai/', keyHost: 'console.x.ai',
  keyPlaceholder: 'xai-…', docsUrl: 'https://docs.x.ai/',
  models: [], visionHint: 'Grok vision models accept pictures.',
 },
 gemini: {
  id: 'gemini', label: 'Google Gemini', kind: 'chat',
  apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  keyUrl: 'https://aistudio.google.com/apikey', keyHost: 'aistudio.google.com',
  keyPlaceholder: 'AIza…', docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
  models: [], visionHint: 'Gemini models accept pictures.',
 },
 custom: {
  id: 'custom', label: 'Custom (OpenAI-compatible)', kind: 'chat',
  apiUrl: '',
  keyUrl: null, keyHost: null,
  keyPlaceholder: 'sk-…', docsUrl: null,
  models: [], visionHint: 'Vision depends on the custom endpoint.',
 },
};

const get = id => Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : null;
const has = id => Object.hasOwn(PROVIDERS, id);
const list = () => Object.values(PROVIDERS);

module.exports = { get, has, list };
