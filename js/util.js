/* ============ Hourling — utilities ============ */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* asset path resolver — single-file builds inject window.ASSETS with data URIs */
function assetUrl(p) {
  return (window.ASSETS && window.ASSETS[p]) || p;
}

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

/* rarity accent colours — used by the summon circle and the reveal card so
   a legendary pull does not look like a common one */
const RARITY_TINT = {
  common: '#7ea6ff', uncommon: '#4ade80', rare: '#45a6ff',
  epic: '#b47cff', legendary: '#ffc247',
};
const TYPE_COLORS = {
  Fire: '#ff7043', Water: '#42a5f5', Nature: '#66bb6a', Electric: '#ffd740',
  Ice: '#80deea', Earth: '#bc8a5f', Shadow: '#9575cd', Mystic: '#f48fb1', Metal: '#90a4ae',
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
    `<span class="typebadge" style="background:${TYPE_COLORS[t] || '#888'}">` +
    `<i class="elem el-${t.toLowerCase()}"></i>${t}</span>`).join('');
}
function elemIcon(t, cls) { return `<i class="elem ${cls || ''} el-${String(t).toLowerCase()}"></i>`; }

/* A move's own icon: element row x move index, from the uploaded sheets. */
function moveIcon(type, idx, cls) {
  const m = (window.MOVE_DATA || {})[type];
  if (!m) return '';
  return `<i class="move ${cls || ''} mv-${m.row}-${idx}"></i>`;
}

/* Deterministic skill artwork: same creature and slot always gets the same
   icon, drawn from the bank for that skill's element. */
function skillIcon(type, seed, cls) {
  const bank = (window.SKILL_ICONS || {})[type] || (window.SKILL_ICONS || {}).Ultimate;
  if (!bank || !bank.length) return '';
  let h = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `<i class="spell ${cls || ''} sp-${bank[h % bank.length]}"></i>`;
}
function icon(key, cls) { return `<i class="ico ${cls || ''} ico-${key}"></i>`; }

/* ---------- the interface takes its accent from your lead buddy ----------
   Everything warm in the UI is one variable, so the whole app shifts hue with
   whoever is at the front of your party. */
function applyBuddyTheme() {
  // The starter you chose owns the theme. Keying off party slot 1 meant the
  // whole UI changed colour the moment a summon reshuffled the party, which
  // is not what picking a starter is supposed to mean.
  const cid = (typeof S !== 'undefined' &&
    (S.starterCid || (S.party && S.party[0]))) || null;
  const type = cid && C_BY_ID[cid] ? C_BY_ID[cid].types[0] : null;
  const c = (type && TYPE_COLORS[type]) || '#ffc247';
  const r = document.documentElement;
  r.style.setProperty('--buddy', c);
  r.style.setProperty('--buddy-dim', mixHex(c, '#101529', 0.55));
  r.style.setProperty('--buddy-glow', hexAlpha(c, 0.34));
  r.style.setProperty('--buddy-soft', mixHex(c, '#101529', 0.94));
  r.style.setProperty('--buddy-hi', mixHex(c, '#ffffff', 0.4));
  r.dataset.buddyType = type || '';
  r.dataset.haste = (typeof isHasted === 'function' && isHasted()) ? '1' : '';
}
function mixHex(a, b, t) {
  const pa = hex3(a), pb = hex3(b);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
}
function hexAlpha(h, a) {
  const p = hex3(h);
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}
function hex3(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
}

/* ---------- toasts ---------- */
function toast(msg, kind) {
  const root = $('#toast-root');
  const t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
  t.setAttribute('role', 'status');
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
function coinBurst(fromEl, n, iconKey) {
  const tgt = $('#hud-gold');
  if (!fromEl || !tgt) return;
  const a = fromEl.getBoundingClientRect(), b = tgt.getBoundingClientRect();
  n = Math.min(n, 7);
  for (let i = 0; i < n; i++) {
    const c = el('div', 'coin-p', `<i class="ico ico-${iconKey || 'gold'}"></i>`);
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
  document.getElementById('app').classList.add('modal-open');
  return back;
}
function syncModalOpen() {
  document.getElementById('app').classList.toggle('modal-open',
    !!document.querySelector('#modal-root .modal-back'));
}
function closeModal(back) {
  if (back && back.parentNode) back.remove();
  syncModalOpen();
}
function closeAllModals() {
  $$('#modal-root .modal-back').forEach(b => b.remove());
  syncModalOpen();
}
