/* ============ Ritual Beasts — chunky pixel VFX ============
   Everything is drawn on one canvas sized to the battle scene, with all
   coordinates snapped to a virtual pixel grid so effects match the sprite art
   instead of looking like smooth vector particles.                            */
'use strict';

const VFX = (() => {
  let cv = null, ctx = null, w = 0, h = 0;
  let parts = [];
  let shake = 0, shakeMag = 0;
  let flash = null;
  let running = false;
  const GRID = 3;              // virtual pixel size

  const PAL = {
    fire:     ['#fff3b0', '#ffd44d', '#ff8a2e', '#ff4d2e', '#a11d10'],
    water:    ['#dff6ff', '#8fd6ff', '#42a6f5', '#1e60b4', '#0d2f66'],
    nature:   ['#e6ffcc', '#a8f06a', '#5cc74e', '#2f8a3a', '#17512a'],
    electric: ['#ffffff', '#fff6a8', '#ffe14d', '#ffb02e', '#a86a00'],
    ice:      ['#ffffff', '#dff6ff', '#a8e8f5', '#5cc0e8', '#2a7fb8'],
    earth:    ['#f0dcc0', '#c8a06a', '#96703c', '#6a4a28', '#3c2a18'],
    shadow:   ['#e0d0ff', '#b07dff', '#7d4dff', '#4a2a9c', '#211044'],
    mystic:   ['#ffffff', '#ffd6f5', '#f48fb1', '#c17dff', '#6a3ca8'],
    metal:    ['#ffffff', '#e0e6f0', '#a8b4c8', '#6a7890', '#3a4458'],
    heal:     ['#ffffff', '#c8ffd8', '#7dffc8', '#34b088', '#1a6a52'],
  };

  function attach(el) {
    cv = el;
    ctx = cv.getContext('2d', { alpha: true });
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv || !cv.parentElement) return;
    const r = cv.parentElement.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    cv.width = w; cv.height = h;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
  }

  /* ---------- particle spawners ---------- */
  function px(x, y, vx, vy, life, colors, size, opts) {
    parts.push(Object.assign({
      x, y, vx, vy, life, maxLife: life, colors,
      size: size || GRID, grav: 0, spin: 0, trail: 0,
    }, opts || {}));
  }

  function burst(x, y, key, n, spread, opts) {
    const colors = PAL[key] || PAL.mystic;
    n = n || 18;
    spread = spread || 3.4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.35 + Math.random()) * spread;
      px(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.6,
         26 + Math.random() * 22, colors,
         GRID * (1 + Math.floor(Math.random() * 2)),
         Object.assign({ grav: 0.06 }, opts));
    }
  }

  /* directional slash: a short arc of pixels sweeping across the target */
  function slash(x, y, key, dir) {
    const colors = PAL[key] || PAL.metal;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = (-0.9 + t * 1.8) * (dir || 1);
      const r = 26 + Math.sin(t * Math.PI) * 20;
      px(x + Math.cos(a) * r, y + Math.sin(a) * r,
         Math.cos(a) * 1.2, Math.sin(a) * 1.2,
         14 + i * 0.8, colors, GRID * 2, { grav: 0 });
    }
  }

  /* rising column, used by fire / nature / earth heavies */
  function column(x, y, key, height) {
    const colors = PAL[key] || PAL.fire;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      px(x + (Math.random() - 0.5) * 34, y + 10 - t * (height || 90),
         (Math.random() - 0.5) * 0.8, -1.4 - Math.random() * 1.6,
         24 + Math.random() * 24, colors, GRID * (1 + Math.floor(Math.random() * 2)),
         { grav: -0.02 });
    }
  }

  /* jagged bolt drawn as a chain of pixels from above */
  function bolt(x, y, key) {
    const colors = PAL[key] || PAL.electric;
    let cx = x + (Math.random() - 0.5) * 30, cy = y - 150;
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      cx += (x - cx) * 0.25 + (Math.random() - 0.5) * 22;
      cy += (y - cy) / (steps - i);
      px(cx, cy, 0, 0, 12 + i, colors, GRID * 2, { grav: 0 });
    }
    burst(x, y, key, 14, 2.6);
  }

  /* orbiting runes for mystic / shadow */
  function ring(x, y, key, n, radius) {
    const colors = PAL[key] || PAL.mystic;
    n = n || 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      px(x + Math.cos(a) * (radius || 34), y + Math.sin(a) * (radius || 34) * 0.6,
         Math.cos(a) * 0.7, Math.sin(a) * 0.4 - 0.5,
         30 + Math.random() * 14, colors, GRID * 2, { grav: -0.01 });
    }
  }

  /* falling shards for ice / metal */
  function shards(x, y, key, n) {
    const colors = PAL[key] || PAL.ice;
    for (let i = 0; i < (n || 14); i++) {
      px(x + (Math.random() - 0.5) * 70, y - 70 - Math.random() * 50,
         (Math.random() - 0.5) * 0.6, 2.4 + Math.random() * 2,
         26 + Math.random() * 16, colors, GRID * 2, { grav: 0.1 });
    }
  }

  /* the per-element signature effect used by skills */
  function cast(kind, x, y, power) {
    power = power || 1;
    switch (kind) {
      case 'fire':     column(x, y, 'fire', 70 * power); burst(x, y, 'fire', 14 * power, 3); break;
      case 'water':    burst(x, y, 'water', 22 * power, 3.6, { grav: 0.12 }); break;
      case 'nature':   column(x, y, 'nature', 60 * power); ring(x, y, 'nature', 8, 30); break;
      case 'electric': bolt(x, y, 'electric'); break;
      case 'ice':      shards(x, y, 'ice', 14 * power); burst(x, y, 'ice', 10, 2.4); break;
      case 'earth':    burst(x, y + 24, 'earth', 20 * power, 3.2, { grav: 0.18 }); shards(x, y, 'earth', 6); break;
      case 'shadow':   ring(x, y, 'shadow', 14, 38); burst(x, y, 'shadow', 14 * power, 2.4); break;
      case 'mystic':   ring(x, y, 'mystic', 16, 42); burst(x, y, 'mystic', 12 * power, 2.8); break;
      case 'metal':    slash(x, y, 'metal', 1); burst(x, y, 'metal', 12 * power, 3.4, { grav: 0.16 }); break;
      case 'heal':     ring(x, y, 'heal', 10, 26); break;
      default:         burst(x, y, kind, 16 * power, 3);
    }
    start();
  }

  function hit(x, y, key, crit) {
    slash(x, y, key || 'metal', Math.random() < .5 ? 1 : -1);
    if (crit) {
      burst(x, y, key || 'metal', 16, 4);
      kick(5, 200);
    }
    start();
  }

  function ultimate(x, y, kind) {
    screenFlash(PAL[kind] ? PAL[kind][0] : '#fff', 320);
    kick(11, 520);
    cast(kind, x, y, 2.4);
    ring(x, y, kind, 22, 58);
    column(x, y, kind, 130);
    setTimeout(() => { burst(x, y, kind, 34, 5.2); ring(x, y, kind, 18, 74); }, 140);
    start();
  }

  function kick(mag, ms) {
    shakeMag = Math.max(shakeMag, mag);
    shake = Math.max(shake, ms);
    start();
  }
  function screenFlash(color, ms) {
    flash = { color, t: ms, max: ms };
    start();
  }

  /* ---------- loop ---------- */
  let last = 0;
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(step);
  }

  function step(now) {
    const dt = Math.min(48, now - last) / 16.667;
    last = now;
    if (!ctx) { running = false; return; }
    ctx.clearRect(0, 0, w, h);

    // screen shake is applied to the scene element, not the canvas alone
    if (shake > 0) {
      shake -= dt * 16.667;
      const k = Math.max(0, shake) / 400;
      const dx = (Math.random() - 0.5) * shakeMag * k * 2;
      const dy = (Math.random() - 0.5) * shakeMag * k * 2;
      const scene = document.getElementById('scene');
      if (scene) scene.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      if (shake <= 0) {
        shakeMag = 0;
        if (scene) scene.style.transform = '';
      }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      const t = 1 - p.life / p.maxLife;
      const ci = Math.min(p.colors.length - 1, Math.floor(t * p.colors.length));
      ctx.fillStyle = p.colors[ci];
      const s = Math.max(GRID, p.size * (1 - t * 0.45));
      // snap to the virtual pixel grid so particles read as pixel art
      const gx = Math.round(p.x / GRID) * GRID;
      const gy = Math.round(p.y / GRID) * GRID;
      ctx.fillRect(gx, gy, Math.round(s), Math.round(s));
    }

    if (flash) {
      flash.t -= dt * 16.667;
      if (flash.t <= 0) flash = null;
      else {
        ctx.globalAlpha = Math.min(0.42, flash.t / flash.max);
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }

    if (parts.length || flash || shake > 0) {
      requestAnimationFrame(step);
    } else {
      running = false;
      const scene = document.getElementById('scene');
      if (scene) scene.style.transform = '';
    }
  }

  return { attach, resize, cast, hit, ultimate, burst, kick, screenFlash, ring,
           get count() { return parts.length; } };
})();
