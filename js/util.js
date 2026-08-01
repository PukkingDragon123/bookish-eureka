/* ============ Ritual Beasts — utilities ============ */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* big-number formatting: 1.23K, 45.6M ... then aa, ab ... */
const NUM_TIERS = ['', 'K', 'M', 'B', 'T'];
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  n = Math.floor(n);
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return String(n);
  let tier = Math.floor(Math.log10(n) / 3);
  let suffix;
  if (tier < NUM_TIERS.length) suffix = NUM_TIERS[tier];
  else {
    const i = tier - NUM_TIERS.length;
    suffix = String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
  }
  const v = n / Math.pow(10, tier * 3);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + suffix;
}

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}:${String(s).padStart(2, '0')}`;
  return `0:${String(s).padStart(2, '0')}`;
}

function todayStr(offsetDays) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function weightedPick(items, weightFn) {
  let total = 0;
  for (const it of items) total += weightFn(it);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const TYPE_COLORS = {
  Fire: '#ff7043', Water: '#42a5f5', Nature: '#66bb6a', Electric: '#ffd740',
  Ice: '#80deea', Earth: '#bc8a5f', Shadow: '#9575cd', Mystic: '#f48fb1', Metal: '#90a4ae',
};
const TYPE_ICONS = {
  Fire: '🔥', Water: '💧', Nature: '🌿', Electric: '⚡',
  Ice: '❄️', Earth: '🪨', Shadow: '🌑', Mystic: '✨', Metal: '⚙️',
};
/* attacker type -> {defender type: multiplier} */
const TYPE_CHART = {
  Fire:     { Nature: 1.5, Ice: 1.5, Water: 0.67, Earth: 0.67 },
  Water:    { Fire: 1.5, Earth: 1.5, Nature: 0.67, Electric: 0.67 },
  Nature:   { Water: 1.5, Earth: 1.5, Fire: 0.67, Shadow: 0.67 },
  Electric: { Water: 1.5, Metal: 1.5, Earth: 0.67, Nature: 0.67 },
  Ice:      { Nature: 1.5, Water: 1.5, Fire: 0.67, Metal: 0.67 },
  Earth:    { Fire: 1.5, Electric: 1.5, Water: 0.67, Nature: 0.67 },
  Shadow:   { Mystic: 1.5, Nature: 1.5, Metal: 0.67, Fire: 0.67 },
  Mystic:   { Shadow: 1.5, Metal: 1.5, Ice: 0.67, Water: 0.67 },
  Metal:    { Ice: 1.5, Nature: 1.5, Fire: 0.67, Electric: 0.67 },
};
function typeMult(atkTypes, defType) {
  let m = 1;
  for (const t of atkTypes) {
    const row = TYPE_CHART[t];
    if (row && row[defType]) { m *= row[defType]; break; }
  }
  return m;
}

function typeBadges(types) {
  return types.map(t =>
    `<span class="typebadge" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`).join('');
}

/* ---------- toasts ---------- */
function toast(msg, kind) {
  const root = $('#toast-root');
  const t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
  root.appendChild(t);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(() => t.remove(), 2800);
}

/* ---------- floating text in battle scene ---------- */
function floatText(txt, x, y, cls) {
  const layer = $('#fx-layer');
  if (!layer) return;
  const f = el('div', 'dmg-float ' + (cls || ''), txt);
  f.style.left = (x + rnd(-18, 18)) + 'px';
  f.style.top = y + 'px';
  layer.appendChild(f);
  setTimeout(() => f.remove(), 1400);
}

/* ---------- coin fly to HUD ---------- */
function coinBurst(fromEl, n, icon) {
  const tgt = $('#hud-gold');
  if (!fromEl || !tgt) return;
  const a = fromEl.getBoundingClientRect(), b = tgt.getBoundingClientRect();
  n = Math.min(n, 7);
  for (let i = 0; i < n; i++) {
    const c = el('div', 'coin-p', icon || '🪙');
    c.style.left = (a.left + a.width / 2 + rnd(-30, 30)) + 'px';
    c.style.top = (a.top + a.height / 2 + rnd(-20, 20)) + 'px';
    document.body.appendChild(c);
    setTimeout(() => {
      c.style.left = (b.left + b.width / 2) + 'px';
      c.style.top = (b.top + b.height / 2) + 'px';
      c.style.opacity = '0.2';
      c.style.transform = 'scale(.5)';
    }, 30 + i * 55);
    setTimeout(() => c.remove(), 750 + i * 55);
  }
}

/* ---------- confetti ---------- */
function confetti(n) {
  const colors = ['#ffd44d', '#64e08c', '#6be2ff', '#c17dff', '#ff5d6c', '#ffb64d'];
  for (let i = 0; i < (n || 26); i++) {
    const c = el('div', 'confetti');
    const size = rnd(5, 10);
    c.style.width = size + 'px';
    c.style.height = size * rnd(0.5, 1) + 'px';
    c.style.background = pick(colors);
    c.style.left = rnd(20, window.innerWidth - 20) + 'px';
    c.style.top = '-12px';
    c.style.borderRadius = Math.random() < .4 ? '50%' : '2px';
    document.body.appendChild(c);
    const fall = rnd(55, 95) / 100 * window.innerHeight;
    const drift = rnd(-80, 80);
    const dur = rnd(900, 1700);
    c.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${fall}px) rotate(${rnd(180, 720)}deg)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.5,.6,1)' });
    setTimeout(() => c.remove(), dur);
  }
}

/* ---------- modal helper ---------- */
function openModal(contentEl, opts) {
  opts = opts || {};
  const root = $('#modal-root');
  const back = el('div', 'modal-back');
  const modal = el('div', 'modal');
  if (!opts.noClose) {
    const x = el('button', 'mclose', '✕');
    x.onclick = () => closeModal(back);
    modal.appendChild(x);
  }
  modal.appendChild(contentEl);
  back.appendChild(modal);
  if (!opts.noClose) back.addEventListener('click', e => { if (e.target === back) closeModal(back); });
  root.appendChild(back);
  return back;
}
function closeModal(back) {
  if (back && back.parentNode) back.remove();
}
function closeAllModals() { $$('#modal-root .modal-back').forEach(b => b.remove()); }
