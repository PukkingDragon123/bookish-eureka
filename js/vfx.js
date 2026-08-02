/* ============ Dreamkeep — VFX 2.0 ============
   Two-pass renderer: a normal pass for solid pixels and an additive pass for
   glow, so effects bloom against the scene without washing sprites out.
   Everything still snaps to a virtual pixel grid — it is bloom on pixel art,
   not a particle system pretending to be pixel art.                         */
'use strict';

const VFX = (() => {
  let cv = null, ctx = null, w = 0, h = 0;
  let parts = [];
  let rings = [];
  let shake = 0, shakeMag = 0;
  let flash = null;
  let hitstop = 0;
  let running = false;
  const GRID = 3;

  const PAL = {
    fire:     ['#fff6d0', '#ffd44d', '#ff9330', '#f2542d', '#a11d10'],
    water:    ['#eafaff', '#a5e4ff', '#42a6f5', '#1e60b4', '#0d2f66'],
    nature:   ['#f0ffd8', '#b6f57a', '#5cc74e', '#2f8a3a', '#17512a'],
    electric: ['#ffffff', '#fffbb0', '#ffe14d', '#ffab24', '#a86a00'],
    ice:      ['#ffffff', '#e6fbff', '#a8e8f5', '#54bfe8', '#2a7fb8'],
    earth:    ['#f6e6cc', '#d3ae78', '#a07a44', '#6a4a28', '#3c2a18'],
    shadow:   ['#efe2ff', '#c2a0ff', '#8a5cff', '#5a2ea8', '#28134d'],
    mystic:   ['#ffffff', '#ffdcf7', '#ff9ad6', '#c86fe8', '#6a3ca8'],
    metal:    ['#ffffff', '#eef3fb', '#b8c4d8', '#78869c', '#3a4458'],
    heal:     ['#ffffff', '#d6ffe4', '#8fe8b0', '#3cb583', '#1a6a52'],
    gold:     ['#fffbe0', '#ffe490', '#ffce4f', '#d99a1e', '#8a5d0c'],
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

  /* ---------- emitters ---------- */
  function px(o) {
    parts.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, life: 30, maxLife: 30,
      colors: PAL.metal, size: GRID, grav: 0, drag: 1,
      glow: 0.55, trail: 0, hist: null, spin: 0, rot: 0,
    }, o));
  }

  function burst(x, y, key, n, spread, opts) {
    const colors = PAL[key] || PAL.mystic;
    n = Math.round(n || 18);
    spread = spread || 3.4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.3 + Math.random()) * spread;
      px(Object.assign({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.7,
        life: 24 + Math.random() * 22, maxLife: 40, colors,
        size: GRID * (1 + Math.floor(Math.random() * 2)),
        grav: 0.07, drag: 0.985, glow: 0.7, trail: Math.random() < 0.35 ? 4 : 0,
      }, opts || {}));
    }
  }

  /* a fast arc of pixels swept across the target */
  function slash(x, y, key, dir) {
    const colors = PAL[key] || PAL.metal;
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const a = (-1.0 + t * 2.0) * (dir || 1);
      const r = 24 + Math.sin(t * Math.PI) * 24;
      px({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8,
           vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.2,
           life: 10 + i, maxLife: 28, colors, size: GRID * 2, glow: 0.9, drag: 0.92 });
    }
  }

  function column(x, y, key, height, n) {
    const colors = PAL[key] || PAL.fire;
    n = n || 28;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      px({ x: x + (Math.random() - 0.5) * 30, y: y + 12 - t * (height || 90),
           vx: (Math.random() - 0.5) * 0.7, vy: -1.5 - Math.random() * 1.8,
           life: 22 + Math.random() * 26, maxLife: 48, colors,
           size: GRID * (1 + Math.floor(Math.random() * 2)),
           grav: -0.025, glow: 0.85, trail: 3 });
    }
  }

  function bolt(x, y, key) {
    const colors = PAL[key] || PAL.electric;
    let cx = x + (Math.random() - 0.5) * 26, cy = y - 170;
    for (let i = 0; i < 18; i++) {
      cx += (x - cx) * 0.26 + (Math.random() - 0.5) * 24;
      cy += (y - cy) / (18 - i);
      px({ x: cx, y: cy, life: 9 + i, maxLife: 28, colors,
           size: GRID * 2, glow: 1, drag: 1 });
    }
    shockwave(x, y, key, 34, 1);
    burst(x, y, key, 14, 2.8);
  }

  function ring(x, y, key, n, radius, spin) {
    const colors = PAL[key] || PAL.mystic;
    n = n || 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      px({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius * 0.55,
           vx: -Math.sin(a) * (spin || 0.9), vy: Math.cos(a) * (spin || 0.9) * 0.5 - 0.4,
           life: 28 + Math.random() * 16, maxLife: 44, colors,
           size: GRID * 2, glow: 0.8, grav: -0.012, trail: 3 });
    }
  }

  function shards(x, y, key, n) {
    const colors = PAL[key] || PAL.ice;
    for (let i = 0; i < (n || 14); i++) {
      px({ x: x + (Math.random() - 0.5) * 74, y: y - 80 - Math.random() * 56,
           vx: (Math.random() - 0.5) * 0.7, vy: 2.6 + Math.random() * 2.2,
           life: 24 + Math.random() * 16, maxLife: 40, colors,
           size: GRID * 2, grav: 0.12, glow: 0.75, trail: 5 });
    }
  }

  /* expanding hollow ring — the impact "pop" every hit gets */
  function shockwave(x, y, key, r, strength) {
    rings.push({ x, y, r: 4, max: r || 40, t: 0, life: 16,
                 color: (PAL[key] || PAL.metal)[1], strength: strength || 1 });
  }

  function sparkle(x, y, key, n) {
    const colors = PAL[key] || PAL.gold;
    for (let i = 0; i < (n || 8); i++) {
      px({ x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 30,
           vx: (Math.random() - 0.5) * 0.5, vy: -0.5 - Math.random(),
           life: 26 + Math.random() * 18, maxLife: 44, colors,
           size: GRID, glow: 1, grav: -0.01 });
    }
  }

  /* ---------- composed effects ---------- */
  function cast(kind, x, y, power) {
    power = power || 1;
    switch (kind) {
      case 'fire':
        column(x, y, 'fire', 76 * power, 24); burst(x, y, 'fire', 14 * power, 3.2);
        shockwave(x, y, 'fire', 40 * power); break;
      case 'water':
        burst(x, y, 'water', 24 * power, 3.8, { grav: 0.14, trail: 5 });
        shockwave(x, y, 'water', 44 * power); break;
      case 'nature':
        column(x, y, 'nature', 62 * power, 20); ring(x, y, 'nature', 9, 30);
        shockwave(x, y, 'nature', 38 * power); break;
      case 'electric':
        bolt(x, y, 'electric'); break;
      case 'ice':
        shards(x, y, 'ice', 15 * power); burst(x, y, 'ice', 10, 2.6);
        shockwave(x, y, 'ice', 40 * power); break;
      case 'earth':
        burst(x, y + 22, 'earth', 22 * power, 3.4, { grav: 0.2 });
        shards(x, y, 'earth', 7); shockwave(x, y + 16, 'earth', 46 * power, 1.3); break;
      case 'shadow':
        ring(x, y, 'shadow', 15, 38, 1.4); burst(x, y, 'shadow', 15 * power, 2.6);
        shockwave(x, y, 'shadow', 42 * power); break;
      case 'mystic':
        ring(x, y, 'mystic', 17, 44, 1.2); sparkle(x, y, 'mystic', 10);
        burst(x, y, 'mystic', 12 * power, 3); shockwave(x, y, 'mystic', 44 * power); break;
      case 'metal':
        slash(x, y, 'metal', 1); burst(x, y, 'metal', 13 * power, 3.6, { grav: 0.18 });
        shockwave(x, y, 'metal', 36 * power); break;
      case 'heal':
        ring(x, y, 'heal', 11, 26); sparkle(x, y, 'heal', 8); break;
      default:
        burst(x, y, kind, 16 * power, 3); shockwave(x, y, kind, 38);
    }
    start();
  }

  function hit(x, y, key, crit) {
    slash(x, y, key || 'metal', Math.random() < .5 ? 1 : -1);
    shockwave(x, y, key || 'metal', crit ? 46 : 28, crit ? 1.4 : 0.8);
    if (crit) { burst(x, y, key || 'metal', 16, 4.2); kick(5, 190); stop(70); }
    start();
  }

  function ultimate(x, y, kind) {
    screenFlash(PAL[kind] ? PAL[kind][0] : '#fff', 300);
    kick(12, 560);
    stop(140);
    cast(kind, x, y, 2.4);
    ring(x, y, kind, 24, 58, 1.6);
    column(x, y, kind, 140, 34);
    shockwave(x, y, kind, 130, 2);
    setTimeout(() => {
      burst(x, y, kind, 34, 5.4);
      ring(x, y, kind, 20, 82, 1.2);
      shockwave(x, y, kind, 170, 1.6);
    }, 150);
    start();
  }

  function comet(x0, y0, x1, y1, key, n) {
    const colors = PAL[key] || PAL.mystic;
    n = n || 30;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      px({ x: lerp(x0, x1, t) + rnd(-6, 6), y: lerp(y0, y1, t) + rnd(-6, 6),
           vx: (x1 - x0) / 90, vy: (y1 - y0) / 90,
           life: 16 + t * 28, maxLife: 46, colors,
           size: GRID * (1 + (i % 2)), glow: 1, trail: 6 });
    }
    start();
  }

  function hearts(x, y) {
    for (let i = 0; i < 8; i++) {
      px({ x: x + rnd(-18, 18), y: y + rnd(-6, 6),
           vx: rnd(-0.4, 0.4), vy: -1.2 - Math.random(),
           life: 34 + Math.random() * 14, maxLife: 48,
           colors: ['#ffd8e2', '#ff9ab0', '#e8536e'], size: GRID * 2, grav: -0.015, glow: 0.8 });
    }
    start();
  }

  function fuse(x, y, tier) {
    burst(x, y, tier >= 5 ? 'mystic' : 'gold', 12 + tier * 4, 2.6 + tier * 0.3);
    shockwave(x, y, 'gold', 24 + tier * 6);
    sparkle(x, y, 'gold', 6);
    if (tier >= 4) kick(4, 170);
    start();
  }

  function harvest(x, y, key) {
    burst(x, y, key || 'nature', 14, 2.6, { grav: 0.1 });
    sparkle(x, y, 'gold', 6);
    shockwave(x, y, 'nature', 30);
    start();
  }

  function portalSwirl(x, y) {
    ring(x, y, 'shadow', 14, 18, 1.8);
    start();
  }

  function kick(mag, ms) {
    shakeMag = Math.max(shakeMag, mag);
    shake = Math.max(shake, ms);
    start();
  }
  function stop(ms) { hitstop = Math.max(hitstop, ms); }
  function screenFlash(color, ms) { flash = { color, t: ms, max: ms }; start(); }
  function isStopped() { return hitstop > 0; }

  /* ---------- loop ---------- */
  let last = 0;
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(step);
  }

  function step(now) {
    const raw = Math.min(48, now - last);
    last = now;
    if (hitstop > 0) hitstop -= raw;
    const dt = (hitstop > 0 ? 0.15 : 1) * raw / 16.667;
    if (!ctx) { running = false; return; }
    ctx.clearRect(0, 0, w, h);

    if (shake > 0) {
      shake -= raw;
      const k = Math.max(0, shake) / 420;
      const scene = document.getElementById('scene');
      if (scene) {
        const dx = (Math.random() - 0.5) * shakeMag * k * 2;
        const dy = (Math.random() - 0.5) * shakeMag * k * 2;
        scene.style.setProperty('--shake-x', dx.toFixed(1) + 'px');
        scene.style.setProperty('--shake-y', dy.toFixed(1) + 'px');
      }
      if (shake <= 0) {
        shakeMag = 0;
        if (scene) { scene.style.setProperty('--shake-x', '0px'); scene.style.setProperty('--shake-y', '0px'); }
      }
    }

    // --- rings (drawn under particles, additive)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t >= r.life) { rings.splice(i, 1); continue; }
      const p = r.t / r.life;
      const rad = r.r + (r.max - r.r) * (1 - Math.pow(1 - p, 2));
      ctx.globalAlpha = (1 - p) * 0.7 * r.strength;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(2, 5 * (1 - p) * r.strength);
      ctx.beginPath();
      ctx.ellipse(Math.round(r.x), Math.round(r.y), Math.round(rad), Math.round(rad * 0.55), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // --- particles: solid pass, collecting glow work as we go
    const glowQueue = [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.trail) {
        p.hist = p.hist || [];
        p.hist.push([p.x, p.y]);
        if (p.hist.length > p.trail) p.hist.shift();
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      if (p.drag !== 1) { p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt); }

      const t = 1 - p.life / p.maxLife;
      const ci = Math.min(p.colors.length - 1, Math.floor(t * p.colors.length));
      const col = p.colors[ci];
      const s = Math.max(GRID, Math.round(p.size * (1 - t * 0.45)));
      const gx = Math.round(p.x / GRID) * GRID;
      const gy = Math.round(p.y / GRID) * GRID;

      if (p.hist) {
        for (let j = 0; j < p.hist.length; j++) {
          const a = (j / p.hist.length) * 0.5 * (1 - t);
          ctx.globalAlpha = a;
          ctx.fillStyle = p.colors[Math.min(p.colors.length - 1, ci + 1)];
          const tx = Math.round(p.hist[j][0] / GRID) * GRID;
          const ty = Math.round(p.hist[j][1] / GRID) * GRID;
          ctx.fillRect(tx, ty, GRID, GRID);
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = col;
      ctx.fillRect(gx, gy, s, s);
      if (p.glow > 0) glowQueue.push([gx, gy, s, col, p.glow * (1 - t)]);
    }

    // --- additive glow pass: same pixels, bigger and translucent
    if (glowQueue.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [gx, gy, s, col, a] of glowQueue) {
        ctx.globalAlpha = a * 0.4;
        ctx.fillStyle = col;
        ctx.fillRect(gx - GRID, gy - GRID, s + GRID * 2, s + GRID * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (flash) {
      flash.t -= raw;
      if (flash.t <= 0) flash = null;
      else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.5, flash.t / flash.max) * 0.8;
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    if (parts.length || rings.length || flash || shake > 0 || hitstop > 0) {
      requestAnimationFrame(step);
    } else {
      running = false;
      const scene = document.getElementById('scene');
      if (scene) { scene.style.setProperty('--shake-x', '0px'); scene.style.setProperty('--shake-y', '0px'); }
    }
  }

  return { attach, resize, cast, hit, ultimate, burst, kick, screenFlash, ring,
           comet, hearts, fuse, harvest, portalSwirl, shockwave, sparkle, stop, isStopped,
           get count() { return parts.length; } };
})();
