(() => {
'use strict';

const APP_BAR = '#161616';
const T = {
 drop: { start: 160, end: 900 },
 form: { start: 620, end: 1200 },
 word: { start: 1050, stagger: 34, duration: 480 },
 glide: { start: 1600, end: 2200 },
};
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const root = document.documentElement;
const splash = document.querySelector('.splash');
const bar = color => window.openshadow?.setTitleBar?.(color);

function finish() {
 root.classList.remove('is-splash');
 splash?.remove();
 bar(APP_BAR);
}

if (!splash || !root.classList.contains('is-splash')) {
 finish();
 return;
}

let skip = null;
const skipped = new Promise(resolve => { skip = resolve; });
const wait = ms => Promise.race([new Promise(resolve => setTimeout(resolve, ms)), skipped]);
const settle = () => {
 for (const animation of splash.getAnimations({ subtree: true })) {
  try { animation.finish(); } catch { /* infinite animations have no end to jump to */ }
 }
};

async function play() {
 const drop = splash.querySelector('.splash-drop');
 const trail = drop?.querySelector('.splash-trail');
 const ripple = drop?.querySelector('.splash-ripple');
 const fly = splash.querySelector('.splash-fly');
 const word = splash.querySelector('.splash-word');
 const orb = splash.querySelector('shadow-orb');
 await customElements.whenDefined('shadow-orb');

 const letters = [...word.textContent].map(char => {
  const letter = document.createElement('span');
  letter.textContent = char;
  return letter;
 });
 word.replaceChildren(...letters);

 // 1. hold on `.splash-bg`; 2. the drop falls from above centre and lands at 900 ms.
 const fall = 60 + innerHeight * 0.7;
 drop?.animate([
  { transform: `translateY(${-fall}px)`, opacity: 0 },
  { transform: 'translateY(0px)', opacity: 1, offset: 0.18 },
  { transform: 'translateY(0px)', opacity: 1 },
 ], { delay: T.drop.start, duration: T.drop.end - T.drop.start, easing: 'cubic-bezier(0.55, 0, 0.75, 0.35)', fill: 'both' });
 trail?.animate([
  { transform: 'scaleY(0)', opacity: 0 },
  { transform: 'scaleY(1)', opacity: 1, offset: 0.35 },
  { transform: 'scaleY(0)', opacity: 0 },
 ], { delay: T.drop.start, duration: T.drop.end - T.drop.start, easing: 'ease-in', fill: 'both' });
 ripple?.animate([
  { transform: 'scale(0.9)', opacity: 1 },
  { transform: 'scale(1.6)', opacity: 0 },
 ], { delay: T.drop.end, duration: 600, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' });
 drop?.animate([{ opacity: 1 }, { opacity: 0 }], { delay: T.drop.end + 120, duration: 240, fill: 'forwards' });

 // 3. the orb forms and 4. its motes ignite (the element runs both from the host classes).
 orb?.classList.add('is-forming', 'is-lit');
 orb?.animate([
  { transform: 'scale(0.2)', opacity: 0 },
  { transform: 'scale(1)', opacity: 1 },
 ], { delay: T.form.start, duration: T.form.end - T.form.start, easing: EASE, fill: 'both' });

 // 5. the wordmark rises per letter.
 letters.forEach((letter, i) => letter.animate(
  [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
  { delay: T.word.start + i * T.word.stagger, duration: T.word.duration, easing: EASE, fill: 'both' },
 ));

 // 6. the orb glides to the title-bar mark, the splash fades and the title bar takes the app colour.
 await wait(T.glide.start);
 if (!splash.isConnected) return;
 splash.classList.add('is-opening');
 const mark = document.querySelector('.titlebar-name .glyph-orb') || document.querySelector('.titlebar-name');
 const from = fly.getBoundingClientRect(), to = mark?.getBoundingClientRect();
 let end = 'translate(0, 0) scale(1)';
 if (to) {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  end = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.42)`;
 }
 fly.animate([{ transform: 'translate(0, 0) scale(1)' }, { transform: end }], { duration: T.glide.end - T.glide.start, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' });
 word.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { delay: T.glide.start + 40, duration: 420, easing: 'ease-in', fill: 'both' });
 splash.querySelector('.splash-bg')?.animate([{ opacity: 1 }, { opacity: 0 }], { delay: T.glide.start + 160, duration: T.glide.end - T.glide.start - 160, easing: 'ease', fill: 'both' });
 setTimeout(() => bar(APP_BAR), T.glide.start + (T.glide.end - T.glide.start) / 2);

 await wait(T.glide.end);
 settle();
 finish();
}

splash.addEventListener('pointerdown', () => skip());
window.addEventListener('keydown', () => skip(), { once: true });
play().catch(finish);
})();
