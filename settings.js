(() => {
'use strict';

const STORAGE = { effort: 'deepseek.effort', mode: 'openghost.mode', model: 'openghost.model', catalog: 'openghost.catalog' };
// The registry mirrored for the settings, so the UI renders before the bridge answers; llm.providers() replaces it with the same data.
const FALLBACK_PROVIDERS = [
 { id: 'deepseek', label: 'DeepSeek', apiUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys', keyHost: 'platform.deepseek.com', keyPlaceholder: 'sk-…', models: [] },
 { id: 'openai', label: 'OpenAI', apiUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', keyHost: 'platform.openai.com', keyPlaceholder: 'sk-…', models: [] },
 { id: 'chatgpt', label: 'ChatGPT', apiUrl: 'https://chatgpt.com/backend-api/codex/responses', keyUrl: null, keyHost: null, keyPlaceholder: null, models: [] },
 { id: 'anthropic', label: 'Anthropic', apiUrl: 'https://api.anthropic.com', keyUrl: 'https://console.anthropic.com/settings/keys', keyHost: 'console.anthropic.com', keyPlaceholder: 'sk-ant-…', models: [] },
 { id: 'mimo', label: 'Xiaomi MiMo', apiUrl: 'https://api.xiaomimimo.com/v1', keyUrl: 'https://platform.xiaomimimo.com', keyHost: 'platform.xiaomimimo.com', keyPlaceholder: 'sk-…', models: [
  { id: 'mimo-v2.6-pro', name: 'MiMo-V2.6-Pro', vision: true },
  { id: 'mimo-v2.6-flash', name: 'MiMo-V2.6-Flash', vision: true },
  { id: 'mimo-v2.6-pro-ultraspeed', name: 'MiMo-V2.6-Pro-Ultraspeed', vision: true },
  { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5-Pro', vision: false },
  { id: 'mimo-v2.5', name: 'MiMo-V2.5', vision: true },
 ] },
 { id: 'moonshot', label: 'Moonshot Kimi', apiUrl: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.moonshot.cn/console/api-keys', keyHost: 'platform.moonshot.cn', keyPlaceholder: 'sk-…', models: [] },
 { id: 'qwen', label: 'Qwen (DashScope)', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/', keyHost: 'bailian.console.aliyun.com', keyPlaceholder: 'sk-…', models: [] },
 { id: 'groq', label: 'Groq', apiUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', keyHost: 'console.groq.com', keyPlaceholder: 'gsk_…', models: [] },
 { id: 'openrouter', label: 'OpenRouter', apiUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', keyHost: 'openrouter.ai', keyPlaceholder: 'sk-or-…', models: [] },
 { id: 'xai', label: 'xAI Grok', apiUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai/', keyHost: 'console.x.ai', keyPlaceholder: 'xai-…', models: [] },
 { id: 'gemini', label: 'Google Gemini', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', keyHost: 'aistudio.google.com', keyPlaceholder: 'AIza…', models: [] },
 { id: 'custom', label: 'Custom (OpenAI-compatible)', apiUrl: '', keyUrl: null, keyHost: null, keyPlaceholder: 'sk-…', models: [] },
];
let PROVIDERS = FALLBACK_PROVIDERS.slice();
let KEYS = {};
// The order providers appear in, in the settings and in the model picker.
let ORDER = [];
let LINKS = {};

function adoptProviders(list) {
 PROVIDERS = list.length ? list : FALLBACK_PROVIDERS.slice();
 ORDER = PROVIDERS.map(provider => provider.id);
 KEYS = {};
 LINKS = {};
 for (const provider of PROVIDERS) {
  if (provider.id === 'chatgpt') continue;
  KEYS[provider.id] = `${provider.id}.apiKey`;
  if (provider.keyUrl) LINKS[provider.id] = [provider.keyUrl, provider.keyHost];
 }
}
adoptProviders([]);

const meta = id => PROVIDERS.find(provider => provider.id === id) || FALLBACK_PROVIDERS.find(provider => provider.id === id) || { id };
const DEFAULT_MODEL = 'deepseek-flash';
const EFFORTS = ['none', 'low', 'high', 'max'];
const DEFAULT_EFFORT = 'high';
const DEFAULT_CONTEXT = 1000000;
// Shown until a key loads the real list, so the picker works before the first check.
const KNOWN_DEEPSEEK = [
 { id: 'deepseek-flash', api: 'deepseek-flash', provider: 'deepseek', name: 'DeepSeek-V4.1-Flash', context: 1048576, efforts: EFFORTS, defaultEffort: DEFAULT_EFFORT, vision: true },
 { id: 'deepseek-v4-pro', api: 'deepseek-v4-pro', provider: 'deepseek', name: 'DeepSeek-V4-Pro', context: 1048576, efforts: EFFORTS, defaultEffort: DEFAULT_EFFORT, vision: false },
];
const MODES = ['ask', 'auto', 'full'];
const DEFAULT_MODE = 'ask';
const CHECK_DELAY = 400;

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function keyRow(provider) {
 const [href, host] = LINKS[provider] || [];
 const info = meta(provider);
 const note = I18n.has(`settings.${provider}.note`) ? ` ${escapeHtml(I18n.t(`settings.${provider}.note`))}` : '';
 const link = href ? ` <a href="${href}" target="_blank" rel="noopener noreferrer">${host}</a>.` : '.';
 const extra = provider === 'custom' ? `
    <input id="settings-url-custom" class="settings-url" data-provider="custom" type="text" placeholder="${escapeHtml(I18n.t('settings.custom.url'))}" aria-label="${escapeHtml(I18n.t('settings.custom.url'))}" autocomplete="off" spellcheck="false">
    <input id="settings-model-custom" class="settings-model" data-provider="custom" type="text" placeholder="${escapeHtml(I18n.t('settings.custom.model'))}" aria-label="${escapeHtml(I18n.t('settings.custom.model'))}" autocomplete="off" spellcheck="false">` : '';
 return `
  <div class="settings-row">
   <div class="settings-text">
    <label class="settings-label" for="settings-key-${provider}">${escapeHtml(I18n.t(`settings.${provider}.key`))}</label>
    <p class="settings-hint"><span>${escapeHtml(I18n.t(`settings.${provider}.hint`))}</span>${link}${note}</p>
   </div>
   <div class="settings-control">
    <input id="settings-key-${provider}" class="settings-key" data-provider="${provider}" type="text" placeholder="${escapeHtml(info.keyPlaceholder || 'sk-…')}" autocomplete="off" spellcheck="false">${extra}
    <p class="settings-status" data-provider="${provider}" role="status"></p>
   </div>
  </div>`;
}

function accountRow() {
 return `
  <div class="settings-row">
   <div class="settings-text">
    <span class="settings-label">${escapeHtml(I18n.t('settings.chatgpt.label'))}</span>
    <p class="settings-hint">${escapeHtml(I18n.t('settings.chatgpt.hint'))}</p>
   </div>
   <div class="settings-control settings-account">
    <div class="settings-account-row">
     <span class="settings-account-who"></span>
     <button type="button" class="settings-button is-primary" data-action="login">${escapeHtml(I18n.t('settings.chatgpt.login'))}</button>
     <button type="button" class="settings-button" data-action="cancel">${escapeHtml(I18n.t('settings.chatgpt.cancel'))}</button>
     <button type="button" class="settings-button" data-action="logout">${escapeHtml(I18n.t('settings.chatgpt.logout'))}</button>
    </div>
    <p class="settings-status" data-provider="chatgpt" role="status"></p>
   </div>
  </div>`;
}

function section(id, name, rows) {
 return `
  <section class="provider" data-provider="${id}" aria-labelledby="provider-${id}">
   <header class="provider-head">
    <h3 class="provider-name" id="provider-${id}">${escapeHtml(name)}</h3>
    <span class="provider-models"></span>
    <span class="provider-state"></span>
   </header>
   ${rows}
  </section>`;
}

class Settings {
 constructor(dialog) {
  this.dialog = dialog;
  this.list = dialog.querySelector('.settings-providers');
  this.keys = Object.fromEntries(Object.entries(KEYS).map(([provider, key]) => [provider, localStorage.getItem(key) || '']));
  this.custom = { apiUrl: localStorage.getItem('custom.apiUrl') || '', model: localStorage.getItem('custom.model') || '' };
  this.account = { connected: false };
  this.catalog = this.readCatalog();
  this.models = [];
  this.efforts = EFFORTS.slice();
  localStorage.removeItem('deepseek.model');
  this.model = localStorage.getItem(STORAGE.model) || DEFAULT_MODEL;
  this.shown = this.model;
  const effort = localStorage.getItem(STORAGE.effort);
  this.effort = typeof effort === 'string' && effort ? effort : DEFAULT_EFFORT;
  const mode = localStorage.getItem(STORAGE.mode);
  this.mode = MODES.includes(mode) ? mode : DEFAULT_MODE;
  this.checks = {};
  this.checked = new Set();
  // Keys saved in an earlier session count as working until a check says otherwise.
  this.accepted = new Set(Object.keys(KEYS).filter(provider => this.keys[provider]));
  this.build();
  this.collect();
  dialog.addEventListener('dismiss', () => dialog.close());
  this.refreshAll();
  this.loadProviders();
 }

 readCatalog() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE.catalog)) || {}; } catch {}
  const base = Object.fromEntries(PROVIDERS.map(provider => [provider.id, provider.models || []]));
  return { ...base, ...saved, deepseek: saved.deepseek?.length ? saved.deepseek : KNOWN_DEEPSEEK.slice() };
 }

 // The bridge answers with the same registry the fallback mirrors; a provider it adds is picked up here.
 async loadProviders() {
  const bridge = window.openghost?.llm;
  if (!bridge?.providers) return;
  let list = [];
  try { list = await bridge.providers(); } catch { return; }
  if (!Array.isArray(list) || !list.length) return;
  if (JSON.stringify(list) === JSON.stringify(PROVIDERS)) return;
  adoptProviders(list);
  this.keys = Object.fromEntries(Object.entries(KEYS).map(([provider, key]) => [provider, localStorage.getItem(key) || '']));
  this.accepted = new Set(Object.keys(KEYS).filter(provider => this.keys[provider]));
  this.build();
  this.collect();
  this.refreshAll();
 }

 saveCatalog() {
  try { localStorage.setItem(STORAGE.catalog, JSON.stringify(this.catalog)); } catch {}
 }

 connected(provider) {
  return provider === 'chatgpt' ? !!this.account.connected : !!this.keys[provider];
 }

 // The badge turns green only once the provider has taken the key, so a mistyped key never looks connected.
 working(provider) {
  return this.connected(provider) && (provider === 'chatgpt' || this.accepted.has(provider));
 }

 // The picker offers the models of every connected provider; with none connected it shows DeepSeek, the app's own default.
 collect() {
  const models = ORDER.filter(provider => this.connected(provider)).flatMap(provider => this.catalog[provider] || []);
  this.models = models.length ? models : KNOWN_DEEPSEEK.slice();
  this.paint();
 }

 find(id) {
  return this.models.find(item => item.id === id) || null;
 }

 // A chat keeps its own model; one that is no longer offered falls back to the model new chats get.
 // Chats started before this was fixed kept the provider's model name rather than the picker's id, so that name is looked up too.
 resolve(id) {
  if (id && this.find(id)) return id;
  const named = id && this.models.find(item => item.api === id);
  if (named) return named.id;
  return this.find(this.model) ? this.model : this.models[0]?.id || DEFAULT_MODEL;
 }

 configFor(id) {
  const model = this.find(id) || KNOWN_DEEPSEEK.find(item => item.id === id) || null;
  const provider = model?.provider || 'deepseek';
  const efforts = model?.efforts?.length ? model.efforts : EFFORTS;
  const effort = efforts.includes(this.effort) ? this.effort : [model?.defaultEffort, DEFAULT_EFFORT].find(level => efforts.includes(level)) || efforts[efforts.length - 1];
  return {
   provider,
   model: model?.api || id,
   name: model?.name || id,
   key: this.keys[provider] || '',
   apiUrl: provider === 'custom' ? this.custom.apiUrl : meta(provider).apiUrl,
   ready: this.connected(provider),
   effort,
   efforts,
   vision: model?.vision !== false,
   thinking: model?.thinking,
   output: model?.output,
  };
 }

 get config() {
  return this.configFor(this.resolve(this.model));
 }

 windowOf(id) {
  return this.find(id)?.context || DEFAULT_CONTEXT;
 }

 // The effort steps follow the model of the chat on screen.
 show(id) {
  if (id === this.shown) return;
  this.shown = id;
  this.applyEfforts();
 }

 applyEfforts() {
  const model = this.find(this.shown);
  const efforts = model?.efforts?.length ? model.efforts : EFFORTS;
  const same = efforts.length === this.efforts.length && efforts.every((level, i) => level === this.efforts[i]);
  this.efforts = efforts.slice();
  if (!efforts.includes(this.effort)) {
   const fallback = [model?.defaultEffort, DEFAULT_EFFORT].find(level => efforts.includes(level));
   this.effort = fallback || efforts[Math.min(efforts.length - 1, 2)];
   localStorage.setItem(STORAGE.effort, this.effort);
  }
  if (!same) this.onEfforts?.(this.efforts);
 }

 setModel(id) {
  if (id === this.model || !this.find(id)) return;
  this.model = id;
  localStorage.setItem(STORAGE.model, id);
 }

 setEffort(value) {
  this.effort = value;
  localStorage.setItem(STORAGE.effort, value);
 }

 setMode(value) {
  if (!MODES.includes(value)) return;
  this.mode = value;
  localStorage.setItem(STORAGE.mode, value);
 }

 changed() {
  this.collect();
  this.applyEfforts();
  this.onModels?.();
 }

 async refreshAll() {
  await this.syncAccount();
  await Promise.all(Object.keys(KEYS).filter(provider => this.keys[provider]).map(provider => this.checkKey(provider)));
 }

 // A sign-in can lapse while the app runs, so the settings ask how it stands each time they open.
 async syncAccount() {
  const auth = window.openghost?.auth;
  if (!auth || this.account.waiting) return;
  const account = await auth.status().catch(() => null);
  if (account && !this.account.waiting) this.setAccount(account);
 }

 // Loads a provider's models into the catalog; the last request for a provider wins.
 async refresh(provider) {
  const token = (this.checks[provider] = (this.checks[provider] || 0) + 1);
  const models = await Providers.models(provider, this.keys[provider], provider === 'custom' ? this.custom.apiUrl : meta(provider).apiUrl);
  if (token !== this.checks[provider]) return false;
  const fallback = provider === 'deepseek' ? KNOWN_DEEPSEEK.slice() : (meta(provider).models || []).slice();
  this.catalog[provider] = models.length ? models : fallback;
  if (!this.catalog[provider].length && provider === 'custom' && this.custom.model) {
   this.catalog[provider] = [{ id: this.custom.model, api: this.custom.model, provider: 'custom', name: this.custom.model }];
  }
  this.saveCatalog();
  this.changed();
  return true;
 }

 build() {
  this.list.innerHTML = ORDER.map(provider => {
   const name = meta(provider).label || provider;
   if (provider === 'chatgpt') return section('chatgpt', name, accountRow());
   return section(provider, name, provider === 'openai' ? accountRow() + keyRow(provider) : keyRow(provider));
  }).join('');
  this.inputs = {};
  for (const input of this.list.querySelectorAll('.settings-key')) {
   const provider = input.dataset.provider;
   this.inputs[provider] = input;
   input.value = this.keys[provider];
   input.addEventListener('input', () => this.onKeyInput(provider));
  }
  this.customInputs = {};
  for (const input of this.list.querySelectorAll('.settings-url, .settings-model')) {
   const kind = input.classList.contains('settings-url') ? 'apiUrl' : 'model';
   this.customInputs[kind] = input;
   input.value = this.custom[kind];
   input.addEventListener('input', () => this.onCustomInput());
  }
  this.statuses = Object.fromEntries([...this.list.querySelectorAll('.settings-status')].map(node => [node.dataset.provider, node]));
  this.accountBox = this.list.querySelector('.settings-account');
  this.accountBox.addEventListener('click', event => {
   const action = event.target.closest('[data-action]')?.dataset.action;
   if (action === 'login') this.login();
   else if (action === 'cancel') window.openghost?.auth?.cancel();
   else if (action === 'logout') this.logout();
  });
  if (!window.openghost?.auth) this.accountBox.closest('.settings-row').hidden = true;
 }

 paint() {
  if (!this.list) return;
  for (const node of this.list.querySelectorAll('.provider')) {
   const id = node.dataset.provider;
   // OpenAI is connected through either the ChatGPT sign-in or a key; a model both offer counts once.
   const live = (id === 'openai' ? ['chatgpt', 'openai'] : [id]).filter(source => this.working(source));
   const on = live.length > 0, count = new Set(live.flatMap(source => this.catalog[source] || []).map(model => model.api)).size;
   const state = node.querySelector('.provider-state');
   state.textContent = I18n.t(on ? 'settings.connected' : 'settings.off');
   state.classList.toggle('is-on', on);
   node.querySelector('.provider-models').textContent = on && count ? I18n.t('settings.models', { count }) : '';
  }
  const box = this.accountBox;
  if (!box) return;
  box.dataset.state = this.account.waiting ? 'waiting' : this.account.connected ? 'connected' : 'idle';
  const who = [this.account.email, this.account.plan && I18n.t('settings.chatgpt.plan', { plan: this.account.plan.charAt(0).toUpperCase() + this.account.plan.slice(1) })].filter(Boolean).join(' · ');
  box.querySelector('.settings-account-who').textContent = this.account.waiting ? I18n.t('settings.chatgpt.waiting') : who;
 }

 setAccount(account) {
  const was = this.account.connected;
  this.account = { connected: !!account?.connected, email: account?.email || '', plan: account?.plan || '' };
  if (account?.error) this.setStatus('chatgpt', account.error, 'error');
  if (this.account.connected && !this.catalog.chatgpt.length) this.refresh('chatgpt').catch(() => {});
  if (was !== this.account.connected) this.changed();
  else this.paint();
 }

 async login() {
  const auth = window.openghost?.auth;
  if (!auth || this.account.waiting) return;
  this.setStatus('chatgpt', '');
  this.account = { ...this.account, waiting: true };
  this.paint();
  const account = await auth.login();
  this.setAccount(account);
  // The badge turning green and the account line say it all; a "signed in" line under them would only repeat it.
  if (account?.connected) await this.refresh('chatgpt').catch(() => {});
 }

 async logout() {
  const auth = window.openghost?.auth;
  if (!auth) return;
  this.setAccount(await auth.logout());
  this.setStatus('chatgpt', '');
 }

 open(reason = '', provider = '') {
  if (!this.dialog.open) {
   this.dialog.showModal();
   this.dialog.focus();
   this.syncAccount();
  }
  if (reason) {
   const target = provider || 'deepseek';
   this.setStatus(target, reason, 'error');
   const field = target === 'chatgpt' ? this.accountBox.querySelector('[data-action="login"]') : this.inputs[target];
   field?.scrollIntoView({ block: 'center' });
   field?.focus();
   return;
  }
  for (const provider of Object.keys(KEYS)) {
   if (this.keys[provider] && !this.checked.has(provider)) this.checkKey(provider);
  }
 }

 onKeyInput(provider) {
  const key = this.inputs[provider].value.trim();
  this.keys[provider] = key;
  if (key) localStorage.setItem(KEYS[provider], key);
  else localStorage.removeItem(KEYS[provider]);
  clearTimeout(this.timer?.[provider]);
  this.timer = { ...this.timer };
  this.checked.delete(provider);
  this.accepted.delete(provider);
  if (!key) {
   this.setStatus(provider, '');
   this.changed();
   return;
  }
  this.paint();
  this.setStatus(provider, I18n.t('settings.key.checking'));
  this.timer[provider] = setTimeout(() => this.checkKey(provider), CHECK_DELAY);
 }

 // The custom endpoint keeps its base URL and model next to its key; both live under their own storage names.
 onCustomInput() {
  const apiUrl = this.customInputs.apiUrl?.value.trim() || '';
  const model = this.customInputs.model?.value.trim() || '';
  this.custom = { apiUrl, model };
  if (apiUrl) localStorage.setItem('custom.apiUrl', apiUrl);
  else localStorage.removeItem('custom.apiUrl');
  if (model) localStorage.setItem('custom.model', model);
  else localStorage.removeItem('custom.model');
  clearTimeout(this.timer?.custom);
  this.checked.delete('custom');
  this.accepted.delete('custom');
  this.changed();
  if (!this.keys.custom) return;
  this.setStatus('custom', I18n.t('settings.key.checking'));
  this.timer = { ...this.timer, custom: setTimeout(() => this.checkKey('custom'), CHECK_DELAY) };
 }

 // A working key shows only in the badge; the line under the field is for the check in progress and for what went wrong.
 async checkKey(provider) {
  const key = this.keys[provider];
  this.setStatus(provider, I18n.t('settings.key.checking'));
  try {
   const current = await this.refresh(provider);
   if (!current || key !== this.keys[provider]) return;
   this.accepted.add(provider);
   this.checked.add(provider);
   this.setStatus(provider, '');
  } catch (error) {
   if (key !== this.keys[provider]) return;
   this.accepted.delete(provider);
   this.setStatus(provider, error.message, 'error');
  }
  this.paint();
 }

 setStatus(provider, text, tone = '') {
  const node = this.statuses?.[provider];
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
 }
}

window.Settings = Settings;
})();
