(() => {
'use strict';

const STATES = ['idle', 'listening', 'thinking', 'talking', 'alert', 'sleeping', 'error'];

const STYLE = `
:host{display:block;--orb-rgb:139,124,246;--orb-eye:#15151a;--look-x:0;--look-y:0}
svg{display:block;width:100%;height:100%;overflow:visible}
.core{fill:var(--orb-eye,#15151a)}
.rim{fill:none;stroke:rgb(var(--orb-rgb,139,124,246));stroke-width:1.6}
.crescent{fill:none;stroke:rgb(var(--orb-rgb,139,124,246));stroke-width:1.4;stroke-linecap:round;opacity:.85}
.band{fill:rgb(var(--orb-rgb,139,124,246))}
.mote{fill:rgb(var(--orb-rgb,139,124,246))}
.core-group{transform-origin:32px 32px;transform-box:view-box;transition:transform .5s cubic-bezier(0.22,1,0.36,1)}
.band-group{transform:translate(calc(var(--look-x) * 1px),calc(var(--look-y) * 1px));transition:transform .38s cubic-bezier(0.22,1,0.36,1)}
.crescent-group{transform-origin:32px 32px;transform-box:view-box;animation:crescent-spin 11s linear infinite}
.motes{transform-origin:32px 32px;transform-box:view-box;animation:mote-orbit 16s linear infinite}
.mote{transform-origin:center;transform-box:fill-box}
.band-group{animation:band-breathe 3.6s ease-in-out infinite}
:host(.is-forming) .rim{stroke-dasharray:1;stroke-dashoffset:1;animation:rim-draw .58s cubic-bezier(0.4,0,0.2,1) .62s forwards}
:host(.is-forming) .motes{opacity:0}
:host(.is-forming.is-lit) .motes{opacity:1}
:host(.is-forming.is-lit) .mote{animation:mote-in 240ms cubic-bezier(0.22,1,0.36,1) both}
:host(.is-forming.is-lit) .mote:nth-child(1){animation-delay:900ms}
:host(.is-forming.is-lit) .mote:nth-child(2){animation-delay:960ms}
:host(.is-forming.is-lit) .mote:nth-child(3){animation-delay:1020ms}
:host(.is-forming.is-lit) .mote:nth-child(4){animation-delay:1080ms}
:host(.is-forming.is-lit) .mote:nth-child(5){animation-delay:1140ms}
@keyframes rim-draw{to{stroke-dashoffset:0}}
@keyframes mote-in{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}
:host(:not([state])) .core-group,
:host([state="idle"]) .core-group{animation:core-float 4.8s ease-in-out infinite}
:host([state="idle"]) .band-group{animation-delay:-1.2s}
:host([state="listening"]) .band-group{animation:band-listen 1.5s ease-in-out infinite}
:host([state="listening"]) .motes{animation-duration:9s}
:host([state="thinking"]) .crescent-group{animation-duration:3.6s}
:host([state="thinking"]) .motes{animation-duration:5.5s}
:host([state="thinking"]) .core-group{animation:core-think 1.9s ease-in-out infinite}
:host([state="talking"]) .band-group{animation:band-talk .52s ease-in-out infinite}
:host([state="alert"]) .rim{animation:rim-alert 1.1s ease-in-out infinite}
:host([state="alert"]) .motes{animation-duration:3.5s}
:host([state="sleeping"]) .core-group{animation:core-sleep 6.4s ease-in-out infinite}
:host([state="sleeping"]) .motes{animation-duration:40s}
:host([state="sleeping"]){opacity:.72}
:host([state="error"]) .rim{animation:rim-error .9s steps(2,end) infinite}
:host([state="error"]) .crescent{opacity:.35}
:host([state]){transition:opacity .4s ease}
@keyframes crescent-spin{to{transform:rotate(360deg)}}
@keyframes mote-orbit{to{transform:rotate(360deg)}}
@keyframes core-float{50%{transform:translateY(-0.9px)}}
@keyframes core-think{50%{transform:scale(1.05)}}
@keyframes core-sleep{50%{transform:scale(.97)}}
@keyframes band-breathe{50%{transform:translate(calc(var(--look-x) * 1px),calc(var(--look-y) * 1px + .6px))}}
@keyframes band-listen{0%,100%{transform:translate(calc(var(--look-x) * 1px),calc(var(--look-y) * 1px)) scaleX(1)}50%{transform:translate(calc(var(--look-x) * 1px),calc(var(--look-y) * 1px)) scaleX(1.3)}}
@keyframes band-talk{0%,100%{transform:translate(calc(var(--look-x) * 1px),calc(var(--look-y) * 1px)) scaleX(1)}50%{transform:translate(calc(var(--look-x) * 1px),calc(var(--look-y) * 1px)) scaleX(1.18)}}
@keyframes rim-alert{50%{opacity:.35}}
@keyframes rim-error{50%{opacity:.2}}
@media (prefers-reduced-motion: reduce){
 *{animation:none !important;transition:none !important}
}
`;

class ShadowOrb extends HTMLElement {
 static get observedAttributes() { return ['state']; }

 constructor() {
  super();
  this.attachShadow({ mode: 'open' }).innerHTML = `<style>${STYLE}</style>
   <svg viewBox="0 0 64 64" aria-hidden="true">
    <g class="core-group"><circle class="core" cx="32" cy="32" r="15"/>
     <circle class="rim" cx="32" cy="32" r="15" pathLength="1"/>
     <g class="crescent-group"><path class="crescent" d="M38 20.6A13.9 13.9 0 0 1 38 43.4"/></g></g>
    <g class="band-group"><rect class="band" x="27" y="30.9" width="10" height="2.2" rx="1.1"/></g>
    <g class="motes">
     <circle class="mote" cx="32" cy="6.5" r="2.4"/>
     <circle class="mote" cx="54.5" cy="34" r="2"/>
     <circle class="mote" cx="32" cy="56.5" r="2.2"/>
     <circle class="mote" cx="10.5" cy="30" r="1.6"/>
     <circle class="mote" cx="45.5" cy="10.5" r="1.8"/>
    </g>
   </svg>`;
  this.core = this.shadowRoot.querySelector('.core');
  this.coreGroup = this.shadowRoot.querySelector('.core-group');
  this.start = performance.now();
 }

 connectedCallback() {
  this.setAttribute('role', 'img');
  if (typeof I18n !== 'undefined') this.setAttribute('aria-label', I18n.t('chat.thinking'));
  if (!this.start || this.start === 0) this.start = performance.now();
 }

 look(x = 0, y = 0, hold = 0) {
  this.style.setProperty('--look-x', x.toFixed(2));
  this.style.setProperty('--look-y', y.toFixed(2));
  if (hold) {
   clearTimeout(this.lookTimer);
   this.lookTimer = setTimeout(() => this.look(0, 0), hold);
  }
 }

 pulse(strength = 0.5) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const amount = Math.max(0, Math.min(1, strength));
  this.coreGroup.animate(
   [{ transform: 'scale(1)' }, { transform: `scale(${1 + amount * 0.22})` }, { transform: 'scale(1)' }],
   { duration: 420, easing: 'cubic-bezier(0.22,1,0.36,1)' },
  );
 }

 get state() { return this.getAttribute('state') || 'idle'; }
 set state(value) { this.setAttribute('state', STATES.includes(value) ? value : 'idle'); }
}

if (!customElements.get('shadow-orb')) customElements.define('shadow-orb', ShadowOrb);
})();
