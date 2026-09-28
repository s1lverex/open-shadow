(() => {
'use strict';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
if (window.openshadow?.desktop) root.classList.add('is-desktop');
if (window.openshadow?.platform === 'darwin') root.classList.add('is-mac');
if (window.openshadow?.platform === 'linux') root.classList.add('is-linux');
if ((root.classList.contains('is-desktop') || params.has('splash')) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('is-splash');
})();
