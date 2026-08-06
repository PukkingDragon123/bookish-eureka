/* ============ Hourling — VFX 2.0 ============
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

  /* ---------- real hand-drawn effect frames ----------
     assets/ui/vfx.png is the CC0 Superpowers "RPG Battle System" FX pack by
     Pixel-boy / Sparklin Labs, cut into an atlas by tools/build-vfx.py. These
     play as actual frame animations; the particle system below is now only an
     accent under them rather than the effect itself.                        */
  let atlasImg = null, atlasReady = false;
  let sprites = [];

  /* which drawn effect stands in for each element / event */
  const FOR_KIND = {
    fire: 'fireball', water: 'swirl', ice: 'swirl', electric: 'bolt',
    earth: 'rubble', metal: 'claw', shadow: 'crescent', mystic: 'holy',
    nature: 'scratch', heal: 'heal', gold: 'sparkring',
  };

  function loadAtlas() {
    if (atlasImg || typeof window.VFX_ATLAS === 'undefined') return;
    atlasImg = new Image();
    atlasImg.onload = () => { atlasReady = true; };
    atlasImg.src = assetUrl('assets/ui/vfx.png');
  }

  /* play one drawn effect centred on x,y */
  function anim(effect, x, y, opts) {
    opts = opts || {};
    const A = window.VFX_ATLAS;
    if (!A) return;
    const e = A.effects[effect];
    if (!e) return;
    sprites.push({
      row: e.row, frames: e.frames, x, y,
      t: 0,
      fps: opts.fps || 18,
      scale: opts.scale || 1,
      alpha: opts.alpha == null ? 1 : opts.alpha,
      spin: opts.spin || 0,
      flip: opts.flip ? -1 : 1,
      glow: opts.glow == null ? 0.55 : opts.glow,
      dy: opts.dy || 0,
    });
    start();
  }

  function drawSprites(dt) {
    if (!atlasReady || !sprites.length) return;
    const A = window.VFX_ATLAS, C = A.cell;
    const glow = [];
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      s.t += dt * (s.fps / 60);
      const f = Math.floor(s.t);
      if (f >= s.frames) { sprites.splice(i, 1); continue; }
      s.y += s.dy * dt;
      const d = C * s.scale;
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      if (s.spin) ctx.rotate(s.spin);
      ctx.scale(s.flip, 1);
      ctx.globalAlpha = s.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlasImg, f * C, s.row * C, C, C, -d / 2, -d / 2, d, d);
      ctx.restore();
      if (s.glow > 0) glow.push([s, f, d]);
    }
    // additive pass so the drawn frames bloom into the scene
    if (glow.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [s, f, d] of glow) {
        ctx.save();
        ctx.translate(Math.round(s.x), Math.round(s.y));
        if (s.spin) ctx.rotate(s.spin);
        ctx.scale(s.flip, 1);
        ctx.globalAlpha = s.alpha * s.glow * 0.5;
        ctx.imageSmoothingEnabled = false;
        const g = d * 1.14;
        ctx.drawImage(atlasImg, f * C, s.row * C, C, C, -g / 2, -g / 2, g, g);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  function attach(el) {
    cv = el;
    ctx = cv.getContext('2d', { alpha: true });
    loadAtlas();
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
  /* One recipe per move family, keyed off the manifest name — a Volley rains
     projectiles, a Beam cuts sideways, a Quake shakes the ground. All composed
     from the drawn frames plus palette particles, so all 90 moves land with a
     distinct, readable effect. */
  function castMove(el, idx, x, y, power) {
    const key = String(el).toLowerCase();
    const bank = (window.MOVE_DATA || {})[el];
    const name = (bank && bank.names[idx] || '').toLowerCase();
    const P = power || 1;
    const has = w => name.indexOf(w) >= 0;
    shockwave(x, y, key, 44 * P);
    if (has('volley') || has('rain') || has('barrage') || has('hail') || has('firework')) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          comet(x + rnd(-70, 70), y - 150, x + rnd(-26, 26), y, key, 22);
          burst(x + rnd(-24, 24), y + rnd(-6, 8), key, 9, 2.8);
        }, i * 110);
      }
      anim('sparkring', x, y, { scale: 1.05, fps: 20, alpha: 0.9 });
    } else if (has('beam') || has('cannon')) {
      anim('bolt', x - 8, y - 4, { spin: -0.85, scale: 1.5, fps: 16 });
      comet(x - 150, y - 6, x, y, key, 26);
      screenFlash((PAL[key] || PAL.mystic)[1], 120);
    } else if (has('ring') || has('trap') || has('net') || has('seal') ||
               has('sigil') || has('circle') || has('snare')) {
      ring(x, y, key, 18, 42, 1.4);
      anim('sparkring', x, y, { scale: 1.6, fps: 13, glow: 0.75 });
    } else if (has('wave') || has('tidal') || has('crash') || has('current')) {
      anim('swirl', x - 16, y, { scale: 1.45, fps: 15 });
      shockwave(x, y, key, 78 * P, 1.6);
      burst(x, y + 8, key, 14, 3.4, { grav: 0.16 });
    } else if (has('orb') || has('bomb') || has('mine') || has('pulse') || has('hole')) {
      anim('sparkring', x, y, { scale: 1.4, fps: 15 });
      burst(x, y, key, 22 * P, 4.2);
      stop(55);
    } else if (has('blade') || has('slash') || has('cutter') || has('saw') || has('lash')) {
      anim(Math.random() < 0.5 ? 'arc' : 'claw', x, y,
           { scale: 1.3, fps: 19, flip: Math.random() < 0.5 });
      burst(x, y, key, 9, 3.4);
    } else if (has('spike') || has('shard') || has('lance') || has('icicle') ||
               has('spear') || has('needle') || has('drill') || has('thorn')) {
      shards(x, y, key, 17);
      anim('claw', x, y, { scale: 1.1, fps: 21, flip: true });
    } else if (has('dash') || has('rush') || has('hook')) {
      anim('scratch', x, y, { scale: 1.25, fps: 22 });
      comet(x - 120, y + 6, x, y, key, 24);
    } else if (has('quake') || has('hammer') || has('anvil') || has('drop') ||
               has('crush') || has('throw') || has('boulder') || has('rock') ||
               has('wall') || has('mountain') || has('impact')) {
      anim('rubble', x, y - 8, { scale: 1.3, fps: 15 });
      setTimeout(() => anim('ground', x, y + 16, { scale: 1.35, fps: 15, alpha: 0.95 }), 140);
      anim('dust', x, y + 18, { scale: 1.2, fps: 13, alpha: 0.8 });
      kick(4, 220);
    } else if (has('storm') || has('cloud') || has('thunder') || has('shock') ||
               has('bolt') || has('strike')) {
      anim('bolt', x, y - 10, { scale: 1.35, fps: 17 });
      burst(x, y, key, 13, 3.2);
      kick(3, 150);
    } else if (has('spiral') || has('cyclone') || has('whirl')) {
      anim('swirl', x, y, { scale: 1.4, fps: 16, spin: 0.4 });
      ring(x, y, key, 12, 30, 1.8);
    } else {
      cast(key, x, y, P);
      return;
    }
    start();
  }

  function cast(kind, x, y, power) {
    if (typeof kind === 'string' && kind.indexOf('move:') === 0) {
      const bits = kind.split(':');
      return castMove(bits[1], +bits[2] || 0, x, y, power);
    }
    power = power || 1;
    // the drawn frames are the effect now — particles below just add grit
    const drawn = FOR_KIND[kind];
    if (drawn) {
      anim(drawn, x, y, { scale: 1.05 + 0.5 * (power - 1), fps: 17,
                          flip: Math.random() < 0.5 });
      if (kind === 'fire') anim('flame', x, y + 6, { scale: 0.9, fps: 14, alpha: 0.85 });
      if (kind === 'earth') anim('dust', x, y + 14, { scale: 1.0, fps: 15, alpha: 0.8 });
    }
    power *= 0.45;                     // particles step back behind the art
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
    const flip = Math.random() < 0.5;
    anim(crit ? 'cross' : 'arc', x, y, { scale: crit ? 1.5 : 1.1, fps: crit ? 16 : 20, flip });
    if (crit) anim('sparkring', x, y, { scale: 1.3, fps: 20, alpha: 0.9 });
    shockwave(x, y, key || 'metal', crit ? 42 : 22, crit ? 1.3 : 0.7);
    if (crit) { burst(x, y, key || 'metal', 10, 4.2); kick(5, 190); stop(70); }
    start();
  }

  function ultimate(x, y, kind) {
    screenFlash(PAL[kind] ? PAL[kind][0] : '#fff', 300);
    kick(12, 560);
    stop(140);
    anim('holy', x, y, { scale: 2.6, fps: 12, glow: 0.8 });
    anim('sparkring', x, y, { scale: 2.0, fps: 15 });
    setTimeout(() => anim('ground', x, y + 26, { scale: 1.8, fps: 14, alpha: 0.9 }), 160);
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
    anim('heal', x, y, { scale: 1.2, fps: 16 });
    anim('sparkring', x, y, { scale: 1.0, fps: 20, alpha: 0.8 });
    burst(x, y, key || 'nature', 8, 2.6, { grav: 0.1 });
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
    if (cv && (w <= 1 || h <= 1)) resize();   // tab may have just become visible
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
    drawSprites(dt);

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

    if (sprites.length || parts.length || rings.length || flash || shake > 0 || hitstop > 0) {
      requestAnimationFrame(step);
    } else {
      running = false;
      const scene = document.getElementById('scene');
      if (scene) { scene.style.setProperty('--shake-x', '0px'); scene.style.setProperty('--shake-y', '0px'); }
    }
  }

  return { attach, resize, anim, cast, hit, ultimate, burst, kick, screenFlash, ring,
           comet, hearts, fuse, harvest, portalSwirl, shockwave, sparkle, stop, isStopped,
           get count() { return parts.length; } };
})();
