(() => {
'use strict';

const PREFIX = 'openshadow:';

const local = {
 async read(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
 },
 async write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
 },
 async remove(key) {
  localStorage.removeItem(PREFIX + key);
 },
};

window.ChatStore = window.openshadow?.store || local;
})();
