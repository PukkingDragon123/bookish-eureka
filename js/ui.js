/* ============ Dreamkeep — UI v4 ============
   Today is the home screen: your dream, one concrete task, a real timer.
   Everything else (battle, garden, beasts) is the reward layer that the
   real practice feeds.                                                     */
'use strict';

const UI = (() => {
  let activeTab = 'today';
  let dexFilter = 'all';

  function sprite(cid) { return assetUrl('assets/creatures/' + C_BY_ID[cid].file); }

  /* integer pixel upscale so every sprite lands at a similar on-screen density */
  function fitSprite(img, cid, target) {
    const c = C_BY_ID[cid];
    const nat = Math.max(c.w, c.h);
    const k = clamp(Math.round(target / nat), 1, 5);
    img.style.width = (c.w * k) + 'px';
    img.style.height = 'auto';
  }

  function heroBeastId() {
    return S.party[0] || S.starterCid || Object.keys(S.beasts)[0] || null;
  }

  /* ================= HUD ================= */
  function renderHud() {
    $('#hud-lvl-num').textContent = S.player.level;
    $('#hud-xp-fill').style.width = (100 * S.player.xp / xpForLevel(S.player.level)) + '%';
    $('#hud-gold').textContent = fmt(S.player.gold);
    $('#hud-gems').textContent = fmt(S.player.gems);
    $('#hud-mana').textContent = fmt(S.player.mana);
    $('#hud-mana-fill').style.width = (100 * S.player.mana / manaMax()) + '%';
    $('#hud-ess').textContent = fmt(S.player.essence);
    $('#hud-seeds').textContent = fmt(S.farm.seeds);
    $('#hud-streak').textContent = S.streak.count;
  }

  /* ================= tabs ================= */
  function switchTab(name) {
    activeTab = name;
    $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    $('#view').scrollTop = 0;
    Sound.click();
    if (name === 'today') renderToday();
    if (name === 'beasts') renderBeasts();
    if (name === 'summon') renderSummon();
    if (name === 'farm') renderFarm();
    if (name === 'quests') { renderQuests(); markQuestDot(false); }
    if (name === 'battle') {
      VFX.resize();                    // canvas measures 0 while the tab is hidden
      renderQuestLog(); renderUpgrades(); renderMerge(); renderCooldowns();
    }
  }
  function currentTab() { return activeTab; }

  function markQuestDot(on) {
    const btn = $('#tabbar button[data-tab=quests]');
    let dot = btn.querySelector('.dot');
    if (on && !dot) btn.appendChild(el('i', 'dot'));
    if (!on && dot) dot.remove();
  }

  /* ============================================================
     TODAY — the whole point of the app
     ============================================================ */
  function renderToday() {
    if (!S.dream || !S.dream.key) return;
    renderHero();
    renderFocus();
    renderRhythm();
    renderTodayQuests();
    renderChallengeInto($('#today-challenge'));
    renderJournal();
  }

  function renderHero() {
    const d = Dream.def();
    const now = new Date();
    $('#hero-date').textContent =
      now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    $('#hero-icon').className = 'hob big h-' + d.art;
    $('#hero-dreamname').textContent = d.name;

    const r = Dream.rung();
    $('#hero-rank').textContent = r === 0
      ? 'Rank — · your first session starts the climb'
      : `Rank ${r}/10 · ${Dream.rungName()}`;

    const nx = Dream.nextRung();
    const fill = $('#hero-ladder-fill');
    if (nx) {
      fill.style.width = (nx.frac * 100) + '%';
      $('#hero-ladder-txt').textContent =
        `${Dream.hoursLogged().toFixed(1)}h / ${nx.hours}h → ${nx.name}`;
    } else {
      fill.style.width = '100%';
      $('#hero-ladder-txt').textContent = `${Dream.hoursLogged().toFixed(0)}h — ladder complete`;
    }

    const why = $('#hero-why');
    why.textContent = S.dream.why ? '“' + S.dream.why + '”' : '';
    why.classList.toggle('hidden', !S.dream.why);

    const cid = heroBeastId();
    const hb = $('#hero-beast');
    if (cid) {
      hb.src = sprite(cid);
      hb.classList.remove('hidden');
      fitSprite(hb, cid, 104);
    } else hb.classList.add('hidden');
  }

  function renderFocus() {
    const wrap = $('#focus-card');
    wrap.innerHTML = '';
    const d = Dream.def();
    const scheduled = Dream.scheduledToday();
    const mins = Dream.minutesToday();
    const done = mins > 0;
    const card = el('div', 'focus' + (done ? ' done-focus' : ''));

    if (S.session) {
      card.innerHTML = `
        <div class="f-label">Session in progress</div>
        <div class="f-task">${Dream.todaysTask()}</div>
        <div class="f-meta"> ${fmtTime(sessionRemaining() / 1000)} left</div>
        <div class="f-actions"></div>`;
      const back = el('button', 'pixbtn huge primary', '<b>Back to session</b>');
      back.onclick = () => openSessionOverlay();
      card.querySelector('.f-actions').appendChild(back);
      wrap.appendChild(card);
      return;
    }

    if (!scheduled && !done) {
      card.innerHTML = `
        <div class="f-label">Rest day</div>
        <div class="f-task">Today is not a ${d.name.toLowerCase()} day.</div>
        <div class="f-rest">Rest day. Your streak is safe.</div>
        <div class="f-actions"></div>`;
      const go = el('button', 'pixbtn huge ghost', `<b>Practise anyway</b><span>${S.dream.mins} min</span>`);
      go.onclick = () => showSessionSetup();
      card.querySelector('.f-actions').appendChild(go);
      wrap.appendChild(card);
      return;
    }

    if (done) {
      card.innerHTML = `
        <div class="f-label">Today · complete</div>
        <div class="f-done"> ${mins} minutes of ${d.unit} logged</div>
        <div class="f-rest">That's the job done. Anything else is bonus.</div>
        <div class="f-actions"></div>`;
      const more = el('button', 'pixbtn huge good', '<b>One more session</b>');
      more.onclick = () => showSessionSetup();
      card.querySelector('.f-actions').appendChild(more);
      wrap.appendChild(card);
      return;
    }

    card.innerHTML = `
      <div class="f-label">Today's focus</div>
      <div class="f-task">${Dream.todaysTask()}</div>
      <div class="f-meta">
        <span> ${S.dream.mins} min</span>
        <span>${icon('mana')} ~${Math.round(S.dream.mins * 2.2)} mana</span>
        <span> ~${Math.round(S.dream.mins * 3.5)} XP</span>
      </div>
      <div class="f-actions"></div>`;
    const acts = card.querySelector('.f-actions');
    const go = el('button', 'pixbtn huge primary', `<b>Start ${d.gerund}</b>`);
    go.onclick = () => showSessionSetup();
    acts.appendChild(go);
    const swap = el('button', 'pixbtn ghost sm', icon('scroll'));
    swap.title = 'Different task';
    swap.onclick = () => { Dream.rerollTask(); Sound.click(); renderFocus(); };
    acts.appendChild(swap);
    wrap.appendChild(card);
  }

  function renderRhythm() {
    const wrap = $('#rhythm-days');
    wrap.innerHTML = '';
    const week = Dream.weekMinutes();
    const todayDow = new Date().getDay();
    Dream.DAY_NAMES.forEach((n, i) => {
      const on = (S.dream.days || []).includes(i);
      const hit = week[i] > 0;
      const d = el('div', 'rday' + (on ? ' on' : '') + (i === todayDow ? ' today' : '') + (hit ? ' hit' : ''));
      d.innerHTML = `${n}<span class="rdot">${hit ? '●' : on ? '○' : '·'}</span>`;
      d.title = hit ? `${week[i]} min` : on ? 'scheduled' : 'rest day';
      wrap.appendChild(d);
    });
    const stats = $('#rhythm-stats');
    stats.innerHTML = '';
    const wk = week.reduce((a, b) => a + b, 0);
    [[S.streak.count, 'day streak'],
     [Dream.hoursLogged().toFixed(1) + 'h', 'total'],
     [wk + 'm', 'this week'],
     [S.dream.sessions || 0, 'sessions']].forEach(([v, k]) => {
      stats.appendChild(el('div', 'rstat', `<b>${v}</b><span>${k}</span>`));
    });
  }

  function renderTodayQuests() {
    Quests.generateToday();
    const list = $('#today-quest-list');
    list.innerHTML = '';
    const open = (S.quests.list || []).filter(q => !q.claimed);
    const show = (open.length ? open : S.quests.list || []).slice(0, 4);
    if (!show.length) { list.appendChild(el('div', 'jempty', 'No quests today.')); return; }
    for (const q of show) {
      const ready = q.progress >= q.target;
      const row = el('div', 'tq' + (ready || q.claimed ? ' tq-done' : ''));
      row.innerHTML = `${icon(q.icon)}<span style="flex:1">${q.name}</span>
        <span class="pixbar good"><i style="width:${100 * Math.min(1, q.progress / q.target)}%"></i></span>
        <b>${q.claimed ? '✓' : q.progress + '/' + q.target}</b>`;
      if (ready && !q.claimed) {
        const b = el('button', 'pixbtn gold tiny', 'Claim');
        b.onclick = e => { e.stopPropagation(); Quests.claim(q.qid, e.currentTarget); renderToday(); };
        row.appendChild(b);
      } else {
        row.onclick = () => switchTab('quests');
      }
      list.appendChild(row);
    }
  }

  function renderJournal() {
    const list = $('#journal-list');
    list.innerHTML = '';
    const log = S.dream.log || [];
    if (!log.length) {
      list.appendChild(el('div', 'jempty',
        'Finish a session and it lands here.'));
      return;
    }
    for (const e of log.slice(0, 12)) {
      const row = el('div', 'jrow');
      row.innerHTML = `<span class="jd">${e.d.slice(5)}</span><span class="jm">${e.m}m</span>
        <span class="jn">${e.n ? e.n : '<i style="opacity:.5">practised</i>'}</span>`;
      list.appendChild(row);
    }
  }

  /* ============================================================
     SESSION — the real timer
     ============================================================ */
  function sessionElapsed() {
    if (!S.session) return 0;
    const s = S.session;
    return (s.elapsedBefore || 0) + (s.paused ? 0 : Date.now() - s.startedAt);
  }
  function sessionRemaining() {
    if (!S.session) return 0;
    return Math.max(0, S.session.mins * 60000 - sessionElapsed());
  }

  function showSessionSetup() {
    const d = Dream.def();
    const box = el('div', 'timer-wrap');
    box.innerHTML = `<h3><span class="hob h-${d.art}"></span> ${d.name}</h3>
      <p class="subtle" style="text-align:center">${Dream.todaysTask()}</p>
      <label style="margin-top:10px">How long?</label>
      <div class="preset-row"></div>
      <div class="mrow"></div>`;
    const row = box.querySelector('.preset-row');
    const opts = [...new Set([5, 10, 15, S.dream.mins, 30, 45, 60])].sort((a, b) => a - b);
    let sel = S.dream.mins;
    for (const m of opts) {
      const p = el('button', 'preset' + (m === sel ? ' on' : ''), m + 'm');
      p.onclick = () => { sel = m; $$('.preset', row).forEach(x => x.classList.remove('on')); p.classList.add('on'); };
      row.appendChild(p);
    }
    const start = el('button', 'pixbtn primary', `<b>Begin</b>`);
    start.onclick = () => { closeAllModals(); startSession(sel); };
    box.querySelector('.mrow').appendChild(start);
    openModal(box);
  }

  function startSession(mins) {
    S.session = { mins, startedAt: Date.now(), paused: false, elapsedBefore: 0,
                  kills0: S.kills, gold0: S.player.gold };
    save();
    Sound.quest();
    openSessionOverlay();
    renderFocus();
  }

  function openSessionOverlay() {
    if (!S.session) return;
    const o = $('#session-overlay');
    const d = Dream.def();
    const cid = heroBeastId();
    o.classList.remove('hidden');
    o.innerHTML = `
      <div class="s-dream">${d.name} · ${S.session.mins} minutes</div>
      <div class="s-task">${Dream.todaysTask()}</div>
      <div class="sring">
        <svg viewBox="0 0 214 214">
          <circle class="glow" cx="107" cy="107" r="95"/>
          <circle class="track" cx="107" cy="107" r="95"/>
          <circle class="fill" cx="107" cy="107" r="95"/>
        </svg>
        <div class="sring-mid"><b id="s-left">--:--</b><span id="s-state">REMAINING</span></div>
        ${cid ? `<img class="sring-beast" src="${sprite(cid)}">` : ''}
      </div>
      <div class="s-battle">
        <div class="sb-label">Your party is fighting while you work</div>
        <div class="sb-scene">
          <div class="sb-bg"></div>
          <div class="sb-party"></div>
          <div class="sb-foe"></div>
        </div>
        <div class="sb-stats">
          <span><i class="ico ico-sword"></i> defeated <b id="sb-kills">0</b></span>
          <span><i class="ico ico-gold"></i> earned <b id="sb-gold">0</b></span>
        </div>
      </div>
      <div class="s-hint">Real time, not screen time. Put the phone down.</div>
      <div class="s-btns"></div>`;
    if (cid) fitSprite(o.querySelector('.sring-beast'), cid, 56);
    const btns = o.querySelector('.s-btns');

    const pause = el('button', 'pixbtn ghost sm', S.session.paused ? 'Resume' : 'Pause');
    pause.onclick = () => {
      const s = S.session;
      if (s.paused) { s.startedAt = Date.now(); s.paused = false; }
      else { s.elapsedBefore = sessionElapsed(); s.paused = true; }
      save();
      pause.textContent = s.paused ? 'Resume' : 'Pause';
      tickSession();
    };
    btns.appendChild(pause);

    const hide = el('button', 'pixbtn ghost sm', 'Hide');
    hide.onclick = () => { o.classList.add('hidden'); renderFocus(); };
    btns.appendChild(hide);

    const fin = el('button', 'pixbtn good sm', 'Finish now');
    fin.onclick = () => finishSession(true);
    btns.appendChild(fin);

    const give = el('button', 'pixbtn ghost sm', 'Cancel');
    give.onclick = () => {
      S.session = null; save();
      o.classList.add('hidden');
      toast('No guilt. Start again whenever you are ready.');
      renderFocus();
    };
    btns.appendChild(give);

    tickSession();
  }

  /* the little live battle inside the session overlay */
  let sbFoe = null;
  function renderSessionBattle() {
    const wrap = $('#session-overlay .sb-scene');
    if (!wrap) return;
    const bg = wrap.querySelector('.sb-bg');
    if (bg && !bg.dataset.area) {
      bg.style.backgroundImage = `url(${assetUrl(AREAS[S.stage.area].bg)})`;
      bg.dataset.area = S.stage.area;
    }
    const pw = wrap.querySelector('.sb-party');
    if (pw && pw.dataset.n !== String(S.party.length)) {
      pw.innerHTML = '';
      for (const cid of S.party) {
        const img = el('img');
        img.src = sprite(cid);
        fitSprite(img, cid, 38);
        pw.appendChild(img);
      }
      pw.dataset.n = String(S.party.length);
    }
    const foe = Battle.enemies.filter(e => !e.dying)[0] || null;
    const fw = wrap.querySelector('.sb-foe');
    if (fw && foe && sbFoe !== foe.cid) {
      sbFoe = foe.cid;
      fw.innerHTML = `<img src="${sprite(foe.cid)}"><span class="sb-hp"><i></i></span>`;
      fitSprite(fw.querySelector('img'), foe.cid, 44);
    } else if (fw && !foe) {
      fw.innerHTML = ''; sbFoe = null;
    }
    if (fw && foe) {
      const i = fw.querySelector('.sb-hp > i');
      if (i) i.style.width = Math.max(0, 100 * foe.hp / foe.hpMax) + '%';
    }
    const s = S.session;
    if (s) {
      const k = $('#sb-kills'), g = $('#sb-gold');
      if (k) k.textContent = fmt(Math.max(0, S.kills - (s.kills0 || 0)));
      if (g) g.textContent = fmt(Math.max(0, S.player.gold - (s.gold0 || 0)));
    }
  }

  /* called once a second from main */
  function tickSession() {
    const o = $('#session-overlay');
    if (!S.session) { o.classList.add('hidden'); return; }
    const left = sessionRemaining();
    if (left <= 0) { finishSession(false); return; }
    if (o.classList.contains('hidden')) return;
    const b = $('#s-left');
    if (b) b.textContent = fmtTime(left / 1000);
    const st = $('#s-state');
    if (st) st.textContent = S.session.paused ? 'PAUSED' : 'REMAINING';
    const fill = o.querySelector('.sring .fill');
    if (fill) fill.style.strokeDashoffset = 597 * (left / (S.session.mins * 60000));
    renderSessionBattle();
  }

  function finishSession(early) {
    if (!S.session) return;
    const mins = Math.max(1, Math.round(sessionElapsed() / 60000));
    const planned = S.session.mins;
    S.session = null;
    save();
    $('#session-overlay').classList.add('hidden');
    if (early && mins < 2) {
      toast('Too short to count — but turning up still matters.');
      renderFocus();
      return;
    }
    Sound.levelup();
    confetti(46);
    VFX.screenFlash && VFX.screenFlash();
    showSessionDone(mins, planned, early);
  }

  function showSessionDone(mins, planned, early) {
    const d = Dream.def();
    const box = el('div', 'sreveal');
    box.innerHTML = `
      <div class="snew">${early && mins < planned ? 'SESSION LOGGED' : 'SESSION COMPLETE'}</div>
      <h2>${mins} minutes of ${d.unit}</h2>
      <p class="subtle" style="margin-top:2px">One line about it?</p>
      <input type="text" id="s-note" maxlength="110" placeholder="e.g. finally got the chord change clean">
      <div class="s-rewards" id="s-rewards"></div>
      <div class="mrow"></div>`;
    const ok = el('button', 'pixbtn gold', '<b>Collect</b>');
    ok.onclick = e => {
      const note = box.querySelector('#s-note').value.trim();
      const r = Dream.completeSession(mins, note);
      coinBurst(e.currentTarget, 8);
      closeAllModals();
      showSessionRewards(r);
    };
    box.querySelector('.mrow').appendChild(ok);
    const pre = box.querySelector('#s-rewards');
    pre.innerHTML = `${icon('mana')} mana &nbsp;  XP &nbsp; ${icon('essence')} essence
      &nbsp; ${icon('seed')} seeds &nbsp; ${icon('gem')} gems`;
    openModal(box, { noClose: true });
    setTimeout(() => { const i = box.querySelector('#s-note'); if (i) i.focus(); }, 80);
  }

  function showSessionRewards(r) {
    const box = el('div', 'sreveal');
    const cid = heroBeastId();
    box.innerHTML = `
      <div class="snew">${r.rungUp ? 'NEW RANK' : 'WELL EARNED'}</div>
      ${r.rungUp ? `<h2>${r.rungUp}</h2><p class="subtle">Rank ${Dream.rung()}/10 on the ${Dream.def().name} ladder.</p>` : ''}
      ${cid ? `<div class="burst"><div class="rays"></div><img src="${sprite(cid)}"></div>` : ''}
      <div class="cstats" style="margin-top:8px">
        <div class="cstat"><span>${icon('mana')} Mana</span><b>+${fmt(r.mana)}</b></div>
        <div class="cstat"><span> XP</span><b>+${fmt(r.xp)}</b></div>
        <div class="cstat"><span>${icon('essence')} Essence</span><b>+${fmt(r.ess)}</b></div>
        <div class="cstat"><span>${icon('seed')} Seeds</span><b>+${fmt(r.seeds)}</b></div>
      </div>
      <p class="subtle" style="margin-top:8px">Your party fed on those ${r.mins} minutes.
        The garden drank too.</p>
      <div class="mrow"></div>`;
    if (cid) fitSprite(box.querySelector('.burst img'), cid, 120);
    const ok = el('button', 'pixbtn primary', '<b>Nice</b>');
    ok.onclick = () => { closeAllModals(); renderAll(); };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box, { noClose: true });
    if (r.rungUp) { confetti(60); Sound.evolve(); }
  }

  /* ============================================================
     BATTLE
     ============================================================ */
  function renderSceneBg() {
    $('#scene-bg').style.backgroundImage = `url(${assetUrl(AREAS[S.stage.area].bg)})`;
  }

  function renderScene() {
    renderSceneBg();
    $('#stage-area').textContent = AREAS[S.stage.area].name + (S.stage.tier ? ` +${S.stage.tier + 1}` : '');
    $('#stage-num').textContent = stageLabel() + ` · Wave ${Math.min(S.stage.wave, WAVES_PER_STAGE)}`;
    const pips = $('#wave-pips');
    pips.innerHTML = '';
    for (let i = 1; i <= WAVES_PER_STAGE; i++) {
      pips.appendChild(el('i', (i < S.stage.wave ? 'done ' : '') + (i === WAVES_PER_STAGE ? 'boss' : '')));
    }
    $('#btn-boss').classList.toggle('hidden', !S.stage.farm);
    renderParty();
    renderPartyHp(Battle.partyHp);
    renderBoost();
  }

  const FOE_POS = [           // slot -> position inside #enemy-row (percent)
    [{ l: 14, b: 8 }],
    [{ l: 2, b: 4 }, { l: 44, b: 24 }],
    [{ l: 0, b: 2 }, { l: 34, b: 20 }, { l: 58, b: 42 }],
  ];

  function renderEnemies(enemies, entering) {
    const row = $('#enemy-row');
    row.innerHTML = '';
    const posSet = FOE_POS[Math.min(enemies.length, 3) - 1] || FOE_POS[0];
    enemies.forEach((e, i) => {
      const p = posSet[Math.min(i, posSet.length - 1)];
      const d = el('div', 'foe' + (entering ? ' enter' : ''));
      d.dataset.slot = e.slot;
      d.style.left = p.l + '%';
      d.style.bottom = p.b + '%';
      d.style.zIndex = 3 - i;
      const boss = e.boss;
      d.innerHTML = `
        <div class="fplate ${boss ? 'bossplate' : ''}">
          <span class="${boss ? 'bossname' : ''}">${boss ? icon('skull') + ' ' : ''}${e.name}</span>
          <span class="pixbar hp"><i style="width:100%"></i></span>
        </div>
        <img src="${sprite(e.cid)}" alt="${e.name}">`;
      const img = d.querySelector('img');
      fitSprite(img, e.cid, boss ? 150 : (enemies.length > 1 ? 88 : 116));
      row.appendChild(d);
    });
    let bt = $('#boss-timer');
    if (enemies.some(e => e.boss)) {
      if (!bt) { bt = el('div'); bt.id = 'boss-timer'; $('#scene').appendChild(bt); }
      bt.textContent = '30';
    } else if (bt) bt.remove();
  }

  function foeEl(e) { return $(`#enemy-row .foe[data-slot="${e.slot}"]`); }

  function renderEnemyHp(e) {
    const d = foeEl(e);
    if (d) d.querySelector('.pixbar i').style.width = Math.max(0, 100 * e.hp / e.hpMax) + '%';
  }
  function renderBossTimer(t) {
    const bt = $('#boss-timer');
    if (bt) bt.textContent = Math.max(0, Math.ceil(t));
  }

  function foePoint(e) {
    const scene = $('#scene'), d = e && foeEl(e);
    if (!scene || !d) return null;
    const r = d.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height * 0.6 };
  }

  function showHit(target, dmg, crit, vfx, label, light) {
    const p = foePoint(target);
    if (!p) return;
    floatText(fmt(dmg), p.x, p.y - 26,
              crit ? 'crit' : light ? 'lightdmg' : '');
    const d = foeEl(target);
    if (d) {
      const img = d.querySelector('img');
      img.classList.remove('hit'); void img.offsetWidth; img.classList.add('hit');
    }
    if (light && !crit) {
      VFX.anim('scratch', p.x, p.y, { scale: 0.72, fps: 24, flip: Math.random() < .5 });
    } else if (vfx) VFX.cast(vfx, p.x, p.y, crit ? 1.5 : 1);
    else VFX.hit(p.x, p.y, 'metal', crit);
    if (crit) VFX.kick(3, 130);
    if (label) skillFlash(label, false);
  }

  /* real approach: the fighter travels to the enemy, strikes, and walks back */
  function attackTween(cid, target, onImpact) {
    const i = S.party.indexOf(cid);
    const f = $$('#party-holder .fighter')[i < 0 ? 0 : i];
    if (!f) { setTimeout(onImpact, 120); return; }
    const tp = foePoint(target);
    const scene = $('#scene');
    let dx = 62, dy = -8;
    if (tp && scene) {
      const fr = f.getBoundingClientRect(), sr = scene.getBoundingClientRect();
      const fx = fr.left - sr.left + fr.width / 2;
      const fy = fr.top - sr.top + fr.height * 0.7;
      dx = clamp(tp.x - fx - 34, 10, 190);
      dy = clamp(tp.y - fy, -60, 24);
    }
    f.style.setProperty('--dashx', Math.round(dx) + 'px');
    f.style.setProperty('--dashy', Math.round(dy) + 'px');
    f.classList.remove('striking');
    f.classList.add('charging');
    setTimeout(() => {
      f.classList.remove('charging');
      f.classList.add('striking');
      onImpact();
      VFX.kick(2, 90);
      setTimeout(() => f.classList.remove('striking'), 230);
    }, 210);
  }

  /* an enemy swing landing on the party — a number you can actually see */
  function showPartyHit(dmg, from) {
    const holder = $('#party-holder'), scene = $('#scene');
    if (!holder || !scene) return;
    const r = holder.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    const x = r.left - sr.left + r.width / 2 + rnd(-18, 18);
    const y = r.top - sr.top + 6;
    floatText('-' + fmt(dmg), x, y, 'enemyhit');
    $$('#party-holder .fighter img').forEach(img => {
      img.classList.remove('hurt'); void img.offsetWidth; img.classList.add('hurt');
    });
    if (from) VFX.anim('scratch', x, y + 14, { scale: 0.8, fps: 22, alpha: 0.9 });
    VFX.kick(2, 80);
    Sound.hit();
  }

  /* a quick jab: short hop forward, small effect, no screen kick */
  function lightAttack(cid, target, onImpact) {
    const i = S.party.indexOf(cid);
    const f = $$('#party-holder .fighter')[i < 0 ? 0 : i];
    if (!f) { setTimeout(onImpact, 60); return; }
    f.style.setProperty('--dashx', '18px');
    f.style.setProperty('--dashy', '-2px');
    f.classList.remove('jab'); void f.offsetWidth; f.classList.add('jab');
    setTimeout(() => { f.classList.remove('jab'); onImpact(); }, 130);
  }

  /* a charge attack winds up visibly, then travels the full distance */
  function chargeAttack(cid, target, sk, onImpact) {
    const i = S.party.indexOf(cid);
    const f = $$('#party-holder .fighter')[i < 0 ? 0 : i];
    if (!f) { setTimeout(onImpact, 120); return; }
    f.classList.remove('winding'); void f.offsetWidth; f.classList.add('winding');
    skillFlash(sk.name, false);
    setTimeout(() => {
      f.classList.remove('winding');
      attackTween(cid, target, onImpact);
    }, 240);
  }

  function enemyLunge(e) {
    const d = e && foeEl(e);
    if (!d) return;
    d.classList.remove('lunging'); void d.offsetWidth; d.classList.add('lunging');
  }

  function showKillRewards(e, gold, mult) {
    const p = foePoint(e);
    if (p) {
      floatText(`+${fmt(gold)} GOLD${mult > 1 ? ' x' + mult : ''}`, p.x, p.y + 20, 'reward');
      VFX.burst(p.x, p.y, 'metal', 10, 2.4);
    }
    const d = foeEl(e);
    if (d) d.classList.add('dying');
    Sound.coin();
  }

  function startAdvance() {
    const bg = $('#scene-bg');
    bg.classList.remove('advancing'); void bg.offsetWidth; bg.classList.add('advancing');
    $$('#party-holder .fighter').forEach(f => {
      f.classList.remove('walking'); void f.offsetWidth; f.classList.add('walking');
    });
    setTimeout(() => bg.classList.remove('advancing'), 1600);
  }

  function renderParty() {
    const holder = $('#party-holder');
    holder.innerHTML = '';
    for (const cid of S.party) {
      const st = beastStats(cid);
      const f = el('div', 'fighter');
      f.innerHTML = `<img src="${sprite(cid)}" alt="${C_BY_ID[cid].name}">` +
        `<span class="flvl">Lv.${st.lvl}</span><span class="fhp"><i></i></span>`;
      fitSprite(f.querySelector('img'), cid, S.party.length > 2 ? 54 : 64);
      holder.appendChild(f);
    }
    renderCooldowns();
  }

  function renderPartyHp(frac) {
    const pct = clamp(frac * 100, 0, 100);
    const col = frac < 0.35 ? 'var(--hp)' : frac < 0.6 ? 'var(--xp)' : 'var(--good)';
    $$('#party-holder .fhp > i').forEach(i => {
      i.style.width = pct + '%';
      i.style.background = col;
    });
  }

  /* per-fighter skill cooldown bars under the scene */
  let cdCards = [];
  function renderCooldowns() {
    const strip = $('#cooldown-strip');
    if (!strip) return;
    strip.innerHTML = '';
    cdCards = [];
    for (const p of Battle.cooldownState()) {
      const c = C_BY_ID[p.cid];
      if (!c) continue;
      const card = el('div', 'cdcard');
      const img = el('img');
      img.src = sprite(p.cid);
      card.appendChild(img);
      const bars = el('div', 'cdbars');
      const meters = [];
      p.skills.forEach(sk => {
        const row = el('div', 'cdrow');
        const art = sk.moveIdx != null ? moveIcon(sk.type, sk.moveIdx)
                                       : skillIcon(sk.type || 'Ultimate', p.cid + sk.name);
        row.innerHTML = `${art}<span class="cdname">${sk.name}</span>` +
          `<span class="cdmeter"><i></i></span>`;
        bars.appendChild(row);
        meters.push(row.querySelector('.cdmeter'));
      });
      card.appendChild(bars);
      strip.appendChild(card);
      cdCards.push({ cid: p.cid, meters });
    }
    tickCooldowns();
  }

  /* cheap per-second refresh — only touches widths, never rebuilds */
  function tickCooldowns() {
    if (!cdCards.length || activeTab !== 'battle') return;
    const state = Battle.cooldownState();
    for (const card of cdCards) {
      const p = state.find(x => x.cid === card.cid);
      if (!p) continue;
      card.meters.forEach((m, i) => {
        const sk = p.skills[i];
        if (!sk) return;
        m.firstChild.style.width = (sk.frac * 100) + '%';
        m.classList.toggle('rdy', sk.frac >= 1);
      });
    }
  }

  function renderBoost() {
    const b = $('#boost-badge');
    if (isExerciseBoost()) {
      b.classList.remove('hidden');
      $('#boost-time').textContent = fmtTime((S.boosts.exerciseUntil - Date.now()) / 1000);
    } else b.classList.add('hidden');
  }

  function renderBattleStats() {
    $('#stat-dps').textContent = fmt(Battle.currentDpsEstimate());
    $('#stat-kills').textContent = fmt(S.kills);
    const cp = $('#stat-cp');
    if (cp) {
      const v = Battle.combatPower();
      if (cp.dataset.v !== String(v)) {
        if (cp.dataset.v !== undefined) {
          cp.classList.remove('cp-up'); void cp.offsetWidth; cp.classList.add('cp-up');
        }
        cp.dataset.v = String(v);
        cp.textContent = fmt(v);
      }
    }
  }

  let flashTimer = null;
  function skillFlash(text, isUlt) {
    const e = $('#skill-flash');
    if (!e) return;
    e.textContent = text;
    e.className = isUlt ? 'ult' : '';
    void e.offsetWidth;
    e.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => e.classList.remove('show'), 1000);
  }

  function renderUltMeter(pct) {
    const fill = $('#ult-fill');
    if (!fill) return;
    fill.style.width = clamp(pct, 0, 100) + '%';
    $('#ult-pct').textContent = Math.floor(pct) + '%';
    $('#ult-wrap').classList.toggle('ready', pct >= 100);
  }

  function showUltimateCast(cid, ult) {
    skillFlash(ult.name, true);
    const i = S.party.indexOf(cid);
    const f = $$('#party-holder .fighter')[i < 0 ? 0 : i];
    if (f) {
      f.style.setProperty('--dashx', '80px');
      f.style.setProperty('--dashy', '-16px');
      f.classList.add('charging');
      setTimeout(() => { f.classList.remove('charging'); f.classList.add('striking'); }, 220);
      setTimeout(() => f.classList.remove('striking'), 480);
    }
    const first = Battle.enemies.filter(e => !e.dying)[0];
    const p = first ? foePoint(first) : null;
    if (p) VFX.ultimate(p.x, p.y, ult.vfx);
    VFX.kick(7, 320);
    VFX.stop(90);
  }

  /* ----- defeat overlay ----- */
  function showDefeat() {
    const o = $('#defeat-overlay');
    o.classList.remove('hidden');
    o.innerHTML = `
      <h2>DEFEATED</h2>
      <p>Your party retreats to camp. Stage ${S.stage.area + 1}-${S.stage.num} resets to wave 1.<br>
      Come back stronger:</p>
      <div class="tips"></div>
      <p class="subtle">resting…</p>`;
    const tips = o.querySelector('.tips');
    const mk = (label, ic, fn) => {
      const b = el('button', 'pixbtn sm', `${icon(ic)} ${label}`);
      b.onclick = fn;
      tips.appendChild(b);
    };
    mk('Buy upgrades', 'sword', () => { hideDefeat(); $('#upgrade-strip').scrollIntoView({ behavior: 'smooth' }); });
    mk('Feed beasts', 'meal', () => { hideDefeat(); switchTab('farm'); });
    mk('Fuse gear', 'portal', () => { hideDefeat(); $('#merge-panel').scrollIntoView({ behavior: 'smooth' }); });
    mk('Practise', 'star', () => { hideDefeat(); switchTab('today'); });
    setTimeout(hideDefeat, 5000);
  }
  function hideDefeat() { $('#defeat-overlay').classList.add('hidden'); }

  /* ----- a chest simply drops; tap it (or wait) to open ----- */
  let chestTimer = null;
  function showEncounter() {
    const o = $('#encounter-overlay');
    if (!o.classList.contains('hidden')) return;
    o.classList.remove('hidden');
    o.innerHTML = `
      <div class="chestdrop">
        <i class="ico huge ico-chest"></i>
        <div class="chest-tap">A chest! Tap to open</div>
      </div>`;
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      clearTimeout(chestTimer);
      const box = o.querySelector('.chestdrop');
      const r = box.getBoundingClientRect();
      const sr = $('#scene').getBoundingClientRect();
      VFX.anim('sparkring', r.left - sr.left + r.width / 2,
               r.top - sr.top + r.height / 2, { scale: 1.6, fps: 16 });
      coinBurst(box, 8);
      Sound.quest();
      const gold = grantGold(Math.floor(rnd(60, 140) * Math.pow(1.2, globalStage())));
      const bits = [`+${fmt(gold)} gold`];
      if (Math.random() < 0.6) { grantSeeds(1); bits.push('+1 seed'); }
      if (Math.random() < 0.35) { grantGems(3); bits.push('+3 gems'); }
      box.classList.add('opened');
      box.querySelector('.chest-tap').textContent = bits.join('  ·  ');
      setTimeout(() => { o.classList.add('hidden'); renderHud(); }, 1100);
    };
    o.onclick = open;
    clearTimeout(chestTimer);
    chestTimer = setTimeout(open, 5000);       // opens itself if ignored
  }

  /* ----- quest log on the battle screen ----- */
  function renderQuestLog() {
    const w = $('#quest-log');
    if (!w) return;
    Quests.generateToday();
    const open = (S.quests.list || []).filter(q => !q.claimed).slice(0, 2);
    const ch = Quests.todaysChallenge();
    let html = '';
    if (!Dream.doneToday() && Dream.scheduledToday()) {
      html += `<div class="qlog-row focus-row"><span class="hob h-${Dream.def().art}"></span> <b>Today's focus:</b> ${Dream.todaysTask()}</div>`;
    }
    if (!S.challenge.done) {
      html += `<div class="qlog-row"> <b>${ch.name}</b></div>`;
    }
    for (const q of open) {
      const done = q.progress >= q.target;
      html += `<div class="qlog-row ${done ? 'done-row' : ''}">${icon(q.icon)} ${q.name}
        <span class="pixbar good"><i style="width:${100 * Math.min(1, q.progress / q.target)}%"></i></span>
        <b>${q.progress}/${q.target}</b></div>`;
    }
    if (!html) html = `<div class="qlog-row"> Everything today is done. Legend.</div>`;
    w.innerHTML = html;
  }

  /* ----- collapsible, level-gated panels -----
     A new player should not meet six upgrade cards and a twelve-slot fusion
     board on their first battle. Both stay shut and locked until the game has
     had a chance to teach the basics. */
  function renderPanels() {
    for (const [key, id] of [['upgrades', '#upgrade-panel'], ['fusion', '#merge-panel']]) {
      const el0 = $(id);
      if (!el0) continue;
      const open = !!(S.settings.panels && S.settings.panels[key]);
      const lock = !unlocked(key);
      el0.classList.toggle('collapsed', lock || !open);
      el0.classList.toggle('locked-panel', lock);
      const head = el0.querySelector('.panel-head');
      if (head) head.disabled = lock;
      const note = el0.querySelector('.panel-note');
      if (note) note.textContent = lock ? `unlocks at Lv.${UNLOCKS[key]}` : '';
    }
  }
  function togglePanel(key) {
    if (!unlocked(key)) { toast(`Unlocks at level ${UNLOCKS[key]}`); return; }
    S.settings.panels[key] = !S.settings.panels[key];
    Sound.click();
    save();
    renderPanels();
  }

  /* ----- cookie-clicker upgrades ----- */
  function renderUpgrades() {
    const strip = $('#upgrade-strip');
    if (!strip) return;
    renderPanels();
    strip.innerHTML = '';
    if (!unlocked('upgrades')) return;
    for (const def of UPGRADE_DEFS) {
      const lvl = S.upgrades[def.key] || 0;
      const cost = upgradeCost(def.key);
      const b = el('button', 'upg' + (S.player.gold < cost ? ' cant' : ''));
      b.innerHTML = `${icon(def.icon)}
        <span class="umain"><span class="uname">${def.name}</span>
        <span class="ulvl">Lv.${lvl} · +${lvl * def.per}${def.unit}</span></span>
        <span class="ucost">${icon('gold')}${fmt(cost)}</span>`;
      b.onclick = () => {
        const c = upgradeCost(def.key);
        if (S.player.gold < c) { toast('Not enough gold'); return; }
        S.player.gold -= c;
        S.upgrades[def.key]++;
        Sound.coin();
        coinBurst(b, 3);
        save();
        renderUpgrades();
        renderHud();
        renderBattleStats();
      };
      strip.appendChild(b);
    }
  }

  /* ----- merge board ----- */
  let dragFrom = null, ghost = null, selSlot = null;
  function renderMerge() {
    const board = $('#merge-board');
    if (!board) return;
    renderPanels();
    if (!unlocked('fusion')) { board.innerHTML = ''; return; }
    Merge.regen();
    board.innerHTML = '';
    S.merge.board.forEach((it, i) => {
      const slot = el('div', 'mslot');
      slot.dataset.i = i;
      if (it) {
        const item = el('div', `mitem t-${it.cat}` + (it.tier >= 5 ? ' hi-tier' : ''));
        item.dataset.v = it.variant;
        item.innerHTML = `<span class="var-dot"></span>` +
          `<span class="gear big g-${mergeVariant(it).gear} t${it.tier}"></span>` +
          `<span class="tier">T${it.tier}</span>`;
        item.title = Merge.itemName(it);
        attachDrag(item, i);
        slot.appendChild(item);
      }
      slot.onclick = () => tapSlot(i);
      board.appendChild(slot);
    });
    const t = Merge.totals();
    $('#merge-bonuses').innerHTML =
      `${icon('sword')}<b>+${t.dmg.toFixed(0)}%</b> <b>+${t.hp.toFixed(0)}%</b> ${icon('gold')}<b>+${t.gold.toFixed(0)}%</b>`;
    $('#portal-energy').textContent = `${S.merge.energy}/${Merge.ENERGY_MAX}`;
    $('#portal-gold-cost').textContent = fmt(Merge.spawnGoldCost());
  }

  function tapSlot(i) {
    const it = S.merge.board[i];
    if (selSlot === null) {
      if (it) { selSlot = i; markSel(); }
      return;
    }
    if (selSlot === i) { selSlot = null; markSel(); return; }
    Merge.drop(selSlot, i);
    selSlot = null;
  }
  function markSel() {
    $$('#merge-board .mslot').forEach((s, i) =>
      s.classList.toggle('drop-ok', i === selSlot));
  }

  function attachDrag(item, from) {
    item.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      dragFrom = from;
      item.classList.add('dragging');
      ghost = el('div', 'merge-ghost mitem t-' + S.merge.board[from].cat);
      ghost.innerHTML = item.innerHTML;
      document.body.appendChild(ghost);
      moveGhost(ev);
      const move = e => moveGhost(e);
      const up = e => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        item.classList.remove('dragging');
        if (ghost) { ghost.remove(); ghost = null; }
        const elAt = document.elementFromPoint(e.clientX, e.clientY);
        const slot = elAt && elAt.closest('.mslot');
        if (slot && dragFrom !== null) {
          const to = parseInt(slot.dataset.i, 10);
          if (to !== dragFrom) { Merge.drop(dragFrom, to); selSlot = null; }
        }
        dragFrom = null;
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }
  function moveGhost(e) {
    if (!ghost) return;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
  }

  function slotPoint(i) {
    const s = $$('#merge-board .mslot')[i];
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function mergeSpawnFx(i) {
    const p = slotPoint(i);
    if (!p) return;
    const f = el('div', 'dmg-float mana-f', '+');
    f.style.position = 'fixed'; f.style.left = p.x + 'px'; f.style.top = p.y + 'px'; f.style.zIndex = 300;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }
  function mergeFuseFx(i, tier) {
    const p = slotPoint(i);
    if (!p) return;
    confetti(8 + tier * 3);
    const f = el('div', 'dmg-float crit', 'T' + tier + '!');
    f.style.position = 'fixed'; f.style.left = (p.x - 10) + 'px'; f.style.top = (p.y - 16) + 'px'; f.style.zIndex = 300;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  /* ================= region map ================= */
  function showMap() {
    const box = el('div');
    box.innerHTML = `<h3>${icon('map')} Regions</h3>
      <p class="subtle" style="text-align:center">Each region keeps its own stage progress.</p>
      <div class="region-grid"></div>`;
    const grid = box.querySelector('.region-grid');
    AREAS.forEach((a, i) => {
      const unlocked = Battle.regionUnlocked(i);
      const cur = i === S.stage.area;
      const d = el('div', 'regioncard' + (cur ? ' current' : '') + (unlocked ? '' : ' lockedr'));
      d.style.backgroundImage = `url(${assetUrl(a.bg)})`;
      const prog = i === S.stage.area ? S.stage.num : (S.regionProgress[i] || (unlocked ? 1 : 0));
      d.innerHTML = `${unlocked ? '' : `<span class="rlock"></span>`}
        <span class="rlabel"><span>${a.name}</span><b>${unlocked ? 'Stage ' + prog : '???'}</b></span>`;
      d.onclick = () => {
        if (!unlocked) { toast('Clear the previous region to unlock'); return; }
        closeAllModals();
        if (!cur) { Battle.travel(i); renderScene(); }
      };
      grid.appendChild(d);
    });
    openModal(box);
  }

  /* ================= beasts tab ================= */
  function renderBeasts() {
    $('#party-count').textContent = `${S.party.length}/${partySlots()} slots`;
    const slots = $('#party-slots');
    slots.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const cid = S.party[i];
      let d;
      if (cid) {
        const st = beastStats(cid);
        const c = C_BY_ID[cid];
        d = el('div', 'pslot');
        d.innerHTML = `<div class="typebadges">${typeBadges(c.types)}</div>
          <img src="${sprite(cid)}" alt=""><span class="pname">${c.name}</span><span class="plvl">Lv.${st.lvl}</span>`;
        d.onclick = () => showCreature(cid);
      } else if (i < partySlots()) {
        d = el('div', 'pslot empty', '<span class="glyph-plus big"></span>');
        d.onclick = () => toast('Pick a beast from your dex below');
      } else {
        const need = i === 1 ? 3 : i === 2 ? 6 : 12;
        d = el('div', 'pslot locked', `<span class="pname">Lv.${need}</span>`);
      }
      slots.appendChild(d);
    }
    renderDexFilters();
    renderCollection();
  }

  function renderDexFilters() {
    const wrap = $('#dex-filters');
    wrap.innerHTML = '';
    for (const o of ['all', 'owned', ...Object.keys(TYPE_COLORS)]) {
      const b = el('button', 'dfilter' + (dexFilter === o ? ' on' : ''),
        o === 'all' ? 'All' : o === 'owned' ? 'Owned' : elemIcon(o) + ' ' + o);
      b.onclick = () => { dexFilter = o; renderBeasts(); };
      wrap.appendChild(b);
    }
  }

  function renderCollection() {
    const grid = $('#collection-grid');
    grid.innerHTML = '';
    let list = window.CREATURES.slice();
    if (dexFilter === 'owned') list = list.filter(c => S.beasts[c.id]);
    else if (dexFilter !== 'all') list = list.filter(c => c.types.includes(dexFilter));
    const rank = c => (S.beasts[c.id] ? 0 : S.dex[c.id] ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
    const ownedN = window.CREATURES.filter(c => S.beasts[c.id]).length;
    $('#dex-count').textContent = `${ownedN} owned · ${window.CREATURES.length} total`;
    const frag = document.createDocumentFragment();
    for (const c of list) {
      const owned = !!S.beasts[c.id];
      const seen = !!S.dex[c.id];
      const d = el('div', 'dexcard' + (owned ? '' : seen ? ' seen-only' : ' unseen'));
      d.dataset.rar = c.rarity;
      const lvl = owned ? `<span class="dlvl">Lv.${S.beasts[c.id].level}</span>` : '';
      const inParty = S.party.includes(c.id) ? `<span class="inparty">${icon('sword')}</span>` : '';
      d.innerHTML = `${inParty}<img loading="lazy" src="${assetUrl('assets/creatures/' + c.file)}" alt="">
        <span class="dname">${owned || seen ? c.name : '???'}</span>${lvl}`;
      if (owned || seen) d.onclick = () => showCreature(c.id);
      frag.appendChild(d);
    }
    grid.appendChild(frag);
  }

  /* ================= creature detail ================= */
  function showCreature(cid) {
    const c = C_BY_ID[cid];
    const owned = !!S.beasts[cid];
    const kit = Lore.kit(cid);
    const st = owned ? beastStats(cid) : null;
    const inst = S.beasts[cid];
    const lvl = owned ? inst.level : 0;
    const box = el('div', 'cdetail');

    let evoHtml = '';
    if (c.line && LINES[c.line]) {
      evoHtml = '<div class="evoline">' + LINES[c.line].map((e, i) => {
        const known = S.dex[e.id] || S.beasts[e.id];
        return (i ? '<span class="arrow">&gt;</span>' : '') +
          `<div class="evostep ${known ? '' : 'unknown'}">` +
          `<img src="${assetUrl('assets/creatures/' + e.file)}"><span>${known ? e.name : '???'}</span></div>`;
      }).join('') + '</div>';
    }

    const skills = kit.skills.map(sk => {
      const isMove = sk.moveIdx != null;
      const lockedMv = sk.unlockLv && lvl < sk.unlockLv;
      const art = isMove ? moveIcon(sk.type, sk.moveIdx) : skillIcon(sk.type, cid + sk.name);
      return `
      <div class="skillrow ${isMove ? 'moverow' : ''} ${lockedMv ? 'locked-move' : ''}">
        <div class="sicon" style="background:${TYPE_COLORS[sk.type] || '#666'}">${art}</div>
        <div><div class="sname">${sk.name}${isMove ? ' <span class="mvtag">MOVE</span>' : ''}</div>
        <div class="sdesc">${sk.desc}</div>
        <div class="smeta">${Math.round(sk.power * 100)}% power · ${sk.cd}s cooldown ·
          ${lockedMv ? `unlocks at Lv.${sk.unlockLv}` : sk.type}</div></div>
      </div>`;
    }).join('');

    let graftHtml = '';
    if (owned && inst.graft && C_BY_ID[inst.graft]) {
      const g = Lore.kit(inst.graft).skills[1];
      graftHtml = `<div class="skillrow graftrow">
        <div class="sicon" style="background:${TYPE_COLORS[g.type] || '#666'}">${skillIcon(g.type, cid + g.name)}</div>
        <div><div class="sname">${g.name} <span class="subtle">(grafted)</span></div>
        <div class="sdesc">Lab-grafted from ${C_BY_ID[inst.graft].name}.</div>
        <div class="smeta">${Math.round(g.power * 100)}% power · ${(g.cd * 1.4).toFixed(1)}s cooldown</div></div>
      </div>`;
    }

    const u = kit.ult;
    const ultHtml = `<div class="skillrow ultrow">
      <div class="sicon" style="background:${TYPE_COLORS[u.type] || '#666'}">${skillIcon('Ultimate', cid + u.name)}</div>
      <div><div class="sname">${u.name}</div><div class="sdesc">${u.desc}</div>
      <div class="smeta">${Math.round(u.power * 100)}% power · hits every enemy at 100% charge</div></div>
    </div>`;

    const passes = kit.passives.map(p => {
      const on = lvl >= p.level;
      return `<div class="passrow ${on ? '' : 'locked'}">${icon(on ? p.icon : 'lock')}
        <div><div class="pname">${p.name}</div><div class="pdesc">${p.desc}</div></div>
        <span class="plock">${on ? 'ACTIVE' : 'Lv.' + p.level}</span></div>`;
    }).join('');

    const mut = (inst && inst.mut) || {};
    const mutBits = Object.entries(mut).map(([k, v]) =>
      `+${v}% ${({ atk: 'attack', hp: 'vitality', spd: 'speed' })[k]}`).join(' · ');

    const dreamEl = S.dream && S.dream.key ? Dream.def().element : null;
    const affinity = dreamEl && c.types.includes(dreamEl)
      ? `<div class="mutline"><span class="hob h-${Dream.def().art}"></span> Shares your ${Dream.def().name} affinity — gains
         <b>80% more XP</b> from every practice session.</div>` : '';

    box.innerHTML = `
      <div class="crarity ${c.rarity}">${c.rarity}</div>
      <h3>${c.name}</h3>
      <div>${typeBadges(c.types)}</div>
      <div class="cimg-wrap"><img class="main" src="${assetUrl('assets/creatures/' + c.file)}" alt="${c.name}"></div>
      <div class="dexbox"><span class="dexlabel">DEX ENTRY No.${c.id}</span>${kit.dex}</div>
      ${affinity}
      ${owned ? `
      <div class="cstats">
        <div class="cstat"><span>Level</span><b>${st.lvl}</b></div>
        <div class="cstat"><span>HP</span><b>${fmt(st.hp)}</b></div>
        <div class="cstat"><span>Attack</span><b>${fmt(st.atk)}</b></div>
        <div class="cstat"><span>Speed</span><b>${st.spd}</b></div>
      </div>
      ${mutBits ? `<div class="mutline">${icon('flask')} Lab mutations: ${mutBits}</div>` : ''}
      <div class="pixbar xp" style="margin-top:6px" title="XP from practice, feeding & battles">
        <i style="width:${Math.min(100, 100 * inst.xp / beastXpNeed(lvl))}%"></i></div>`
      : '<p class="subtle" style="margin-top:6px">Not yet bonded — summon or evolve to recruit.</p>'}
      <div class="sectitle">${icon('sword')} Skills</div>${skills}${graftHtml}
      <div class="sectitle"> Ultimate</div>${ultHtml}
      <div class="sectitle"> Passives</div>${passes}
      ${evoHtml ? `<div class="sectitle"> Evolution line</div>${evoHtml}` : ''}
      <div class="mrow" id="cd-actions"></div>`;

    const img = box.querySelector('.cimg-wrap img');
    fitSprite(img, cid, 116);

    const back = openModal(box);
    const actions = box.querySelector('#cd-actions');
    if (!owned) return;

    const feedB = el('button', 'pixbtn good sm');
    feedB.innerHTML = `<b>Feed</b><span>${icon('meal')} ${Farm.totalFood()} food</span>`;
    feedB.disabled = Farm.totalFood() <= 0;
    feedB.onclick = () => showFeedPicker(cid, () => { closeModal(back); showCreature(cid); });
    actions.appendChild(feedB);

    const cost = levelUpCost(cid);
    const lu = el('button', 'pixbtn gold sm');
    lu.innerHTML = `<b>Level Up</b><span>${icon('gold')} ${fmt(cost)}</span>`;
    lu.disabled = S.player.gold < cost;
    lu.onclick = () => {
      if (S.player.gold < levelUpCost(cid)) return;
      S.player.gold -= levelUpCost(cid);
      const before = inst.level;
      inst.level++;
      Quests.progress('levelup_beast', 1);
      Sound.coin();
      const unlocked = kit.passives.find(p => p.level > before && p.level <= inst.level);
      if (unlocked) { Sound.levelup(); confetti(26); toast(`${c.name} unlocked ${unlocked.name}!`, 'good'); }
      save(); renderHud(); renderParty();
      closeModal(back); showCreature(cid);
    };
    actions.appendChild(lu);

    const req = evolveReq(cid);
    if (req) {
      const ev = el('button', 'pixbtn sm');
      ev.innerHTML = `<b>Evolve</b><span>Lv.${req.lvlReq} + ${req.essReq} ${icon('essence')}</span>`;
      ev.disabled = !(inst.level >= req.lvlReq && S.player.essence >= req.essReq);
      ev.onclick = () => { closeModal(back); doEvolve(cid); };
      actions.appendChild(ev);
    }

    const inParty = S.party.includes(cid);
    const pt = el('button', 'pixbtn sm ' + (inParty ? '' : 'good'));
    pt.innerHTML = inParty ? '<b>Rest</b>' : '<b>Send to battle</b>';
    pt.onclick = () => {
      if (inParty) {
        if (S.party.length === 1) { toast('You need at least one fighter!'); return; }
        S.party = S.party.filter(x => x !== cid);
      } else {
        if (S.party.length >= partySlots()) { toast(`Party full — ${partySlots()} slots at your level`); return; }
        S.party.push(cid);
      }
      Sound.click();
      save(); applyBuddyTheme(); renderParty(); renderBeasts();
      closeModal(back); showCreature(cid);
    };
    actions.appendChild(pt);
  }

  function showFeedPicker(cid, after) {
    const c = C_BY_ID[cid];
    const box = el('div');
    box.innerHTML = `<h3>${icon('meal')} Feed ${c.name}</h3>
      <p class="subtle" style="text-align:center">Matching element food gives double XP.</p>
      <div class="feed-grid"></div>`;
    const grid = box.querySelector('.feed-grid');
    let any = false;
    for (const [elName, food] of Object.entries(FOODS)) {
      const have = S.farm.food[elName] || 0;
      if (!have) continue;
      any = true;
      const opt = el('button', 'feed-opt' + (c.types.includes(elName) ? ' match' : ''));
      opt.innerHTML = `<span class="crop big c-${elName.toLowerCase()}"></span>` +
        `<span>${food.name}</span><b>x${have}</b>`;
      opt.onclick = e => {
        if (Farm.feed(cid, elName, e.currentTarget)) {
          closeAllModals();
          if (after) after();
          renderHud();
        }
      };
      grid.appendChild(opt);
    }
    if (!any) box.appendChild(el('p', 'pantry-empty', 'The pantry is empty — grow crops in the Garden.'));
    openModal(box);
  }

  /* ================= evolution ================= */
  function doEvolve(cid) {
    const req = evolveReq(cid);
    if (!req) return;
    const inst = S.beasts[cid];
    if (inst.level < req.lvlReq || S.player.essence < req.essReq) return;
    S.player.essence -= req.essReq;
    const to = req.to;
    const keep = { level: inst.level, xp: 0, mut: inst.mut, graft: inst.graft };
    delete S.beasts[cid];
    S.beasts[to] = keep;
    S.dex[to] = 'owned';
    S.party = S.party.map(x => x === cid ? to : x);
    Sound.evolve();
    const c = C_BY_ID[to];
    const box = el('div', 'sreveal');
    box.innerHTML = `
      <div class="snew">EVOLUTION</div>
      <div class="burst"><div class="rays"></div><img src="${assetUrl('assets/creatures/' + c.file)}" style="filter:brightness(0)"></div>
      <h2>${C_BY_ID[cid].name} &gt; ???</h2>
      <div>${typeBadges(c.types)}</div>`;
    const back = openModal(box, { noClose: true });
    const img = box.querySelector('.burst img');
    fitSprite(img, to, 140);
    const h2 = box.querySelector('h2');
    setTimeout(() => {
      img.style.transition = 'filter 1.1s';
      img.style.filter = 'brightness(1)';
      h2.textContent = `${C_BY_ID[cid].name} > ${c.name}!`;
      confetti(50);
    }, 900);
    const ok = el('button', 'pixbtn primary', '<b>Magnificent!</b>');
    ok.style.marginTop = '12px';
    ok.onclick = () => { closeModal(back); renderAll(); };
    box.appendChild(ok);
    save();
  }

  /* ============================================================
     GARDEN
     ============================================================ */
  const ELEM_CLASS = {
    Fire: 'fire', Water: 'water', Nature: 'nature', Electric: 'electric', Ice: 'ice',
    Earth: 'earth', Shadow: 'shadow', Mystic: 'mystic', Metal: 'metal',
  };

  function plantStage(p) {
    if (!p.el) return -1;
    if (Farm.ready(p)) return 3;
    const total = Farm.growMs(p.el);
    const frac = clamp(1 - Farm.remaining(p) / total, 0, 1);
    return frac < 0.34 ? 0 : frac < 0.7 ? 1 : 2;
  }

  function renderFarm() {
    $('#farm-seeds').textContent = S.farm.seeds;

    const beds = $('#garden-beds');
    beds.innerHTML = '';
    // the field looks watered when anything has been sped up recently
    beds.classList.toggle('watered', S.farm.plots.some(p => p.el && (p.boost || 0) > 0));

    S.farm.plots.forEach((p, i) => {
      const cell = el('div', 'plotcell');
      const st = plantStage(p);
      if (st < 0) {
        cell.classList.add('empty-plot');
        cell.innerHTML = `<span class="emptymark"></span><span class="plabel">plant</span>`;
        cell.onclick = () => showPlantModal(i);
      } else if (st === 3) {
        cell.classList.add('ready');
        cell.innerHTML = `<span class="plant big p-${ELEM_CLASS[p.el]} s3"></span>
          <span class="plabel">HARVEST</span>`;
        cell.onclick = e => {
          const r = e.currentTarget.getBoundingClientRect();
          Farm.harvest(i, e.currentTarget);
          VFX.harvest && VFX.harvest(r.left + r.width / 2, r.top + r.height / 2);
        };
      } else {
        const rem = Farm.remaining(p);
        cell.innerHTML = `<span class="plant big p-${ELEM_CLASS[p.el]} s${st}"></span>
          <span class="plabel">${fmtTime(rem / 1000)}</span>`;
        cell.onclick = () => toast(
          `${FOODS[p.el].name} — ${fmtTime(Farm.remaining(p) / 1000)} to go. Practice sessions water the field!`);
      }
      beds.appendChild(cell);
    });

    // butterflies drifting over the crops
    const bugs = $('#garden-bugs');
    if (!bugs.childElementCount) {
      [[8, 128, 0], [48, 186, -3.5], [66, 148, -6.5]].forEach(([l, t, d]) => {
        const b = el('div', 'bug');
        b.style.left = l + '%'; b.style.top = t + 'px'; b.style.animationDelay = d + 's';
        b.innerHTML = '<span class="prop prop-butterfly"></span>';
        bugs.appendChild(b);
      });
    }

    // pantry
    const pan = $('#pantry');
    pan.innerHTML = '';
    let total = 0;
    for (const [elName, food] of Object.entries(FOODS)) {
      const n = S.farm.food[elName] || 0;
      if (!n) continue;
      total += n;
      const chip = el('button', 'food-chip',
        `<span class="crop c-${elName.toLowerCase()}"></span> ${food.name} <b>x${n}</b>`);
      chip.onclick = () => showFeedTarget(elName);
      pan.appendChild(chip);
    }
    $('#pantry-count').textContent = total;
    if (!total) pan.appendChild(el('p', 'pantry-empty',
      'Nothing harvested yet. Crops grow in real time.'));
    renderFood();
  }

  function waterGarden() {
    const growing = S.farm.plots.filter(p => p.el && !Farm.ready(p)).length;
    if (!growing) { toast('Nothing planted to water yet.'); return; }
    if (S.player.mana < 20) { toast('Needs 20 mana — practise to earn some.', 'mana'); return; }
    S.player.mana -= 20;
    Farm.waterAll(5);
    Sound.habit();
    const beds = $('#garden-beds');
    beds.classList.add('watered');
    const r = beds.getBoundingClientRect();
    VFX.harvest && VFX.harvest(r.left + r.width / 2, r.top + r.height / 3);
    renderFarm();
    renderHud();
  }

  function showPlantModal(plotI) {
    if (S.farm.seeds <= 0) {
      toast('No seeds! Finish a session or log a real meal to earn seeds.', 'mana');
      return;
    }
    const dreamEl = S.dream && S.dream.key ? Dream.def().element : null;
    const box = el('div');
    box.innerHTML = `<h3>${icon('seed')} Plant a crop</h3>
      <p class="subtle" style="text-align:center">Seeds: ${S.farm.seeds} — each crop feeds one element.</p>
      <div class="feed-grid"></div>`;
    const grid = box.querySelector('.feed-grid');
    for (const [elName, food] of Object.entries(FOODS)) {
      const opt = el('button', 'feed-opt' + (elName === dreamEl ? ' match' : ''));
      opt.innerHTML = `<span class="plant big p-${ELEM_CLASS[elName]} s3"></span>
        <span>${food.name}</span><b>${food.mins}min</b>`;
      opt.onclick = () => { if (Farm.plant(plotI, elName)) closeAllModals(); };
      grid.appendChild(opt);
    }
    openModal(box);
  }

  function showFeedTarget(elName) {
    const owned = Object.keys(S.beasts);
    if (!owned.length) return;
    const box = el('div');
    box.innerHTML = `<h3>${icon(FOODS[elName].icon)} Feed ${FOODS[elName].name} to…</h3>
      <div class="feed-grid"></div>`;
    const grid = box.querySelector('.feed-grid');
    for (const cid of owned) {
      const c = C_BY_ID[cid];
      const match = c.types.includes(elName);
      const opt = el('button', 'feed-opt' + (match ? ' match' : ''));
      opt.innerHTML = `<img src="${sprite(cid)}" style="width:40px;height:40px;object-fit:contain">
        <span>${c.name}</span><b>Lv.${S.beasts[cid].level}${match ? ' x2!' : ''}</b>`;
      opt.onclick = e => {
        if (Farm.feed(cid, elName, e.currentTarget)) { closeAllModals(); renderFarm(); renderHud(); }
      };
      grid.appendChild(opt);
    }
    openModal(box);
  }

  /* ----- meal log (with optional photo -> tiny thumbnail) ----- */
  function showMealModal(healthyDefault) {
    const box = el('div');
    box.innerHTML = `<h3>${icon('meal')} Log Food</h3>
      <label>What did you eat?</label>
      <input type="text" id="meal-name" maxlength="40" placeholder="e.g. Chicken salad">
      <label>Calories</label>
      <input type="number" id="meal-kcal" min="0" max="5000" placeholder="e.g. 450">
      <label class="photo-label" id="photo-lab"> <span id="photo-txt">Add a photo (+1 seed)</span>
        <input type="file" id="meal-photo" accept="image/*" capture="environment" style="display:none"></label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--txt)">
        <input type="checkbox" id="meal-healthy" ${healthyDefault ? 'checked' : ''} style="width:18px;height:18px"> This was a healthy choice
      </label>
      <div class="mrow"></div>`;
    let thumb = null;
    const photoInput = box.querySelector('#meal-photo');
    box.querySelector('#photo-lab').onclick = e => { if (e.target !== photoInput) photoInput.click(); };
    photoInput.onchange = () => {
      const f = photoInput.files && photoInput.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 48;
        const cx = cv.getContext('2d');
        const s = Math.min(img.width, img.height);
        cx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 48, 48);
        thumb = cv.toDataURL('image/jpeg', 0.55);
        const lab = box.querySelector('#photo-lab');
        lab.innerHTML = `<img src="${thumb}"> <span>Photo attached! (+1 seed)</span>`;
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(f);
    };
    const ok = el('button', 'pixbtn good', '<b>Log it</b>');
    ok.onclick = () => {
      const name = box.querySelector('#meal-name').value.trim();
      const kcal = parseInt(box.querySelector('#meal-kcal').value, 10) || 0;
      const healthy = box.querySelector('#meal-healthy').checked;
      closeAllModals();
      Habits.logMeal(name, kcal, healthy, $('#btn-log-meal'), thumb);
      renderFarm();
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box);
    setTimeout(() => box.querySelector('#meal-name').focus(), 60);
  }

  function renderFood() {
    Habits.resetMealsIfNewDay();
    const now = Habits.kcalToday();
    $('#kcal-now').textContent = now;
    $('#kcal-goal').textContent = '/ ' + S.kcalTarget + ' kcal';
    const arc = $('#kcal-arc');
    arc.style.strokeDashoffset = 213.6 * (1 - clamp(now / S.kcalTarget, 0, 1));
    arc.style.stroke = now > S.kcalTarget ? 'var(--hp)' : 'var(--good)';
    const list = $('#meal-list');
    list.innerHTML = '';
    for (const m of S.meals.slice().reverse()) {
      const row = el('div', 'meal-row');
      row.innerHTML = `${m.photo ? `<img class="mthumb" src="${m.photo}">` : ''}
        <b>${m.name}</b><span>${m.kcal ? m.kcal + ' kcal' : '—'}</span>`;
      list.appendChild(row);
    }
  }

  function showKcalTargetModal() {
    const box = el('div');
    box.innerHTML = `<h3>Daily Calorie Target</h3>
      <p class="subtle" style="text-align:center">Finish a logged day at or under target for bonus gems & essence.</p>
      <input type="number" id="kcal-t" min="800" max="6000" value="${S.kcalTarget}">
      <div class="mrow"></div>`;
    const ok = el('button', 'pixbtn primary', '<b>Set target</b>');
    ok.onclick = () => {
      const v = parseInt(box.querySelector('#kcal-t').value, 10);
      if (v >= 800 && v <= 6000) { S.kcalTarget = v; save(); renderFood(); }
      closeAllModals();
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box);
  }

  /* ================= summon tab ================= */
  const BANNER_ART = {
    wild: { cid: '02_00', from: '#3a5a2a', to: '#243a17' },
    element: null,
    radiant: { cid: '13_08', from: '#7a5a1e', to: '#4a3010' },
  };
  const ELEM_BANNER_ART = {
    Fire: { cid: '17_03', from: '#8a3a1e', to: '#4a1a0c' },
    Water: { cid: '02_08', from: '#1e4a8a', to: '#0c2a4a' },
    Nature: { cid: '13_02', from: '#3a6a2a', to: '#1c3a14' },
    Electric: { cid: '07_10', from: '#8a7a1e', to: '#4a3e0c' },
    Ice: { cid: '12_02', from: '#2a6a8a', to: '#14364a' },
    Earth: { cid: '04_13', from: '#6a4a2a', to: '#3a2814' },
    Shadow: { cid: '14_92', from: '#4a2a6a', to: '#241438' },
    Mystic: { cid: '14_43', from: '#8a2a6a', to: '#4a1438' },
    Metal: { cid: '08_18', from: '#5a626a', to: '#2e3338' },
  };

  function renderSummon() {
    const rail = $('#banner-rail');
    rail.innerHTML = '';
    for (const b of Summon.banners()) {
      const art = b.id === 'element' ? (ELEM_BANNER_ART[b.elem] || BANNER_ART.radiant) : BANNER_ART[b.id];
      const card = el('div', 'banner');
      card.style.background = `linear-gradient(150deg, ${art.from}, ${art.to})`;
      card.innerHTML = `
        <div class="bname">${icon(b.icon)} ${b.name}</div>
        <div class="bsub">${b.sub}</div>
        <div class="bstars"></div>
        <div class="bshow"><img src="${assetUrl('assets/creatures/' + C_BY_ID[art.cid].file)}"></div>
        <div class="bbtns"></div>`;
      fitSprite(card.querySelector('.bshow img'), art.cid, 104);
      const btns = card.querySelector('.bbtns');
      const one = el('button', 'pixbtn sm ' + (b.cur === 'mana' ? 'primary' : 'gem'));
      one.innerHTML = `<b>Pull</b><span>${icon(b.cur === 'mana' ? 'mana' : 'gem')} ${b.cost}</span>`;
      one.onclick = () => Summon.doSummon(b.id, 1);
      const ten = el('button', 'pixbtn sm gold');
      ten.innerHTML = `<b>x10</b><span>${icon(b.cur === 'mana' ? 'mana' : 'gem')} ${b.cost * 9}</span>`;
      ten.onclick = () => Summon.doSummon(b.id, 10);
      btns.appendChild(one);
      btns.appendChild(ten);
      rail.appendChild(card);
    }
    const left = Summon.PITY_EVERY - (S.summons.sinceRare % Summon.PITY_EVERY);
    $('#pity-note').textContent = `Guaranteed rare+ within ${left} pull${left > 1 ? 's' : ''} · x10 always contains a rare+ · ${S.summons.total} total pulls`;
  }

  /* ----- summoning: a rune circle of the nine elements ----- */
  function playWish(banner, results) {
    const o = $('#wish-overlay');
    o.classList.remove('hidden');
    const best = results.reduce((m, r) => {
      const ri = r.c ? RARITY_ORDER.indexOf(r.c.rarity) : 2;
      return Math.max(m, ri);
    }, 0);
    const color = best >= 4 ? '#ffc247' : best >= 3 ? '#b47cff' : best >= 2 ? '#45a6ff' : '#aab4d8';
    const els = ['fire', 'water', 'nature', 'electric', 'ice', 'earth', 'shadow', 'mystic', 'metal'];
    o.innerHTML = `
      <div class="rune-stage" style="--rune:${color}">
        <div class="rune-ring">${els.map((e, i) =>
          `<i class="elem huge el-${e}" style="--i:${i}"></i>`).join('')}</div>
        <div class="rune-core"><i class="ico huge ico-portal"></i></div>
        <div class="rune-flash"></div>
      </div>
      <div class="wish-tap">tap to skip</div>`;
    Sound.summon();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      o.classList.add('hidden');
      o.innerHTML = '';
      showPullResults(banner, results);
    };
    o.onclick = finish;
    // converge, flash, reveal — timed to the CSS keyframes
    setTimeout(() => { const st = o.querySelector('.rune-stage'); if (st) st.classList.add('converge'); }, 900);
    setTimeout(() => {
      const st = o.querySelector('.rune-stage');
      if (st) st.classList.add('flashing');
      VFX.kick(6, 260);
    }, 1650);
    setTimeout(finish, 2050);
  }

  function showPullResults(banner, results) {
    if (results.length === 1) {
      const r = results[0];
      return showSummonReveal(r.c, r.isNew, r.dup, banner);
    }
    const box = el('div', 'sreveal');
    box.innerHTML = `<div class="snew">${banner.name.toUpperCase()} — 10 PULL</div><div class="pull-grid"></div><div class="mrow"></div>`;
    const grid = box.querySelector('.pull-grid');
    results.forEach((r, i) => {
      const cell = el('div', 'pull-cell' + (r.c && ['rare', 'epic', 'legendary'].includes(r.c.rarity) ? ' r-' + r.c.rarity : ''));
      {
        cell.innerHTML = `<img src="${assetUrl('assets/creatures/' + r.c.file)}">
          <span>${r.c.name}</span>${r.isNew ? '<span class="pnew">NEW!</span>' : `<span class="subtle">+${r.dup ? r.dup.ess : 0}${' '}ess</span>`}`;
      }
      cell.style.animationDelay = (i * 60) + 'ms';
      grid.appendChild(cell);
    });
    confetti(30);
    openModal(box);
  }

  function showSummonReveal(c, isNew, dup, banner) {
    const box = el('div', 'sreveal');
    box.innerHTML = `
      ${isNew ? '<div class="snew">NEW COMPANION</div>' : ''}
      <div class="burst"><div class="rays"></div><img src="${assetUrl('assets/creatures/' + c.file)}"></div>
      <div class="crarity ${c.rarity}">${c.rarity}</div>
      <h2>${c.name}</h2>
      <div>${typeBadges(c.types)}</div>
      ${dup ? `<p class="subtle" style="margin-top:6px">Already bonded — gained +${dup.ess} essence and grew to Lv.${dup.level}!</p>` : ''}
      ${isNew && S.party.includes(c.id) ? '<p class="subtle" style="margin-top:6px">Joined your party!</p>' : ''}`;
    fitSprite(box.querySelector('.burst img'), c.id, 150);
    const back = openModal(box);
    const again = el('button', 'pixbtn primary sm');
    again.innerHTML = `<b>Pull again</b>`;
    again.onclick = () => { closeModal(back); Summon.doSummon(banner ? banner.id : 'wild', 1); };
    const row = el('div', 'mrow');
    row.appendChild(again);
    box.appendChild(row);
    if (isNew) confetti(36);
  }

  /* ================= quests tab ================= */
  function renderQuests() {
    Quests.generateToday();
    renderLoginRow();
    renderChallengeInto($('#challenge-card'));
    renderRituals();
    $('#quest-day').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const wrap = $('#quest-list');
    wrap.innerHTML = '';
    for (const q of S.quests.list) {
      const done = q.progress >= q.target;
      const card = el('div', 'quest' + (done ? ' done' : ''));
      const rw = [];
      if (q.reward.gems) rw.push(icon('gem') + q.reward.gems);
      if (q.reward.lp) rw.push(icon('flask') + q.reward.lp);
      if (q.reward.seeds) rw.push(icon('seed') + q.reward.seeds);
      if (q.reward.mana) rw.push(icon('mana') + q.reward.mana);
      if (q.reward.gold) rw.push(icon('gold'));
      card.innerHTML = `
        <div class="qic">${icon(q.icon)}</div>
        <div class="qmain">
          <div class="qname">${q.name}</div>
          <span class="pixbar good"><i style="width:${100 * Math.min(1, q.progress / q.target)}%"></i></span>
          <div class="qprog-txt">${q.progress}/${q.target} ${rw.join(' ')}</div>
        </div>`;
      const btn = el('button', 'qclaim pixbtn gold tiny', q.claimed ? 'Claimed' : 'Claim');
      btn.disabled = !done || q.claimed;
      btn.onclick = e => Quests.claim(q.qid, e.currentTarget);
      card.appendChild(btn);
      wrap.appendChild(card);
    }
    const j = $('#journey-panel');
    j.innerHTML = '';
    const stats = [
      ['star', 'Hours practised', Dream.hoursLogged().toFixed(1) + 'h'],
      ['crown', 'Dream rank', `${Dream.rung()}/10 — ${Dream.rungName()}`],
      ['streak', 'Current streak', S.streak.count + ' day' + (S.streak.count === 1 ? '' : 's')],
      ['sword', 'Beasts defeated', fmt(S.kills)],
      ['skull', 'Bosses slain', fmt(S.bossKills)],
      ['paw', 'Companions bonded', Object.keys(S.beasts).length],
            ['book', 'Journey started', new Date(S.created).toLocaleDateString()],
    ];
    for (const [ic, k, v] of stats) j.appendChild(el('div', 'jstat', `<span>${icon(ic)}${k}</span><b>${v}</b>`));
  }

  function renderLoginRow() {
    const row = $('#login-row');
    row.innerHTML = '';
    const claimIdx = Quests.loginClaimable();
    const cur = S.login.cycle % 7;
    Quests.LOGIN.forEach((r, i) => {
      const isToday = i === claimIdx;
      const d = el('div', 'login-day' + (i < cur ? ' claimed' : '') + (isToday ? ' today' : ''));
      d.innerHTML = `<span class="dnum">D${i + 1}</span>${icon(r.icon, 'big')}<span>${r.text}</span>`;
      if (isToday) d.onclick = () => {
        const got = Quests.claimLogin();
        if (got) { toast(`Login day ${i + 1}: ${got.text}!`, 'gold'); renderQuests(); renderHud(); }
      };
      row.appendChild(d);
    });
  }

  function renderChallengeInto(wrap) {
    if (!wrap) return;
    const ch = Quests.todaysChallenge();
    const done = S.challenge.done;
    wrap.innerHTML = '';
    const card = el('div', 'challenge' + (done ? ' done-ch' : ''));
    card.innerHTML = `
      <div class="cic">${icon(ch.icon, 'big')}</div>
      <div style="flex:1;min-width:0">
        <div class="cname">${done ? 'DONE: ' : ''}${ch.name}</div>
        <div class="cdesc">${ch.desc}</div>
        <div class="crew">${icon('gem')} +${Quests.CHALLENGE_REWARD.lp} gems ${icon('gem')} +${Quests.CHALLENGE_REWARD.gems} gems · waters the garden</div>
        <div class="cbtns"></div>
      </div>`;
    const btns = card.querySelector('.cbtns');
    if (ch.link) {
      const a = el('a', 'pixbtn gem tiny');
      a.href = ch.link; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = ` Open`;
      btns.appendChild(a);
    }
    if (!done) {
      const b = el('button', 'pixbtn gold tiny', 'I did it!');
      b.onclick = e => { Quests.completeChallenge(e.currentTarget); };
      btns.appendChild(b);
    }
    wrap.appendChild(card);
  }

  /* supporting habit cards */
  function renderRituals() {
    const wrap = $('#ritual-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const def of Habits.DEFS) wrap.appendChild(ritualCard(def, false));
    const cwrap = $('#custom-list');
    cwrap.innerHTML = '';
    for (const def of S.custom) cwrap.appendChild(ritualCard(def, true));
  }

  function ritualCard(def, isCustom) {
    const done = Habits.doneToday(def.id);
    const max = def.perDay || 1;
    const complete = done >= max;
    const card = el('div', 'ritual' + (complete ? ' done-all' : ''));
    const prog = max > 1
      ? `<div class="rprog">${Array.from({ length: max }, (_, i) => `<i class="${i < done ? 'f' : ''}"></i>`).join('')}</div>`
      : '';
    let rewardTxt;
    if (def.kind === 'timer') {
      rewardTxt = ` real timer &nbsp; ${icon('mana')} ~${Math.round((def.manaPerMin || 1) * 15)} / 15min` +
        (def.boost ? ` &nbsp; ${icon('bolt')} x3 idle boost` : '');
    } else {
      rewardTxt = `${icon('mana')} +${def.mana} &nbsp;  +${def.xp} XP` +
        (def.ess ? ` &nbsp; ${icon('essence')} +${def.ess}` : '');
    }
    card.innerHTML = `
      <div class="ric">${icon(def.icon, 'big')}</div>
      <div class="rmain">
        <div class="rname">${def.name}</div>
        <div class="rdesc">${def.desc || ''}</div>
        <div class="rreward">${rewardTxt}</div>
        ${prog}
      </div>`;
    let btn;
    if (def.kind === 'timer') {
      const running = S.exTimer && S.exTimer.hid === def.id;
      btn = el('button', 'rbtn pixbtn gem tiny', running ? fmtTime(Habits.timerRemaining() / 1000) : 'Start');
      btn.disabled = complete && !running;
      btn.onclick = () => running ? showTimerModal() : showTimerStart(def);
    } else if (def.kind === 'meal') {
      btn = el('button', 'rbtn pixbtn good tiny', complete ? 'Done' : `Log (${done}/${max})`);
      btn.disabled = complete;
      btn.onclick = () => showMealModal(true);
    } else {
      btn = el('button', 'rbtn pixbtn good tiny', complete ? 'Done' : max > 1 ? `+1 (${done}/${max})` : 'Done!');
      btn.disabled = complete;
      btn.onclick = e => { Habits.completeInstant(def, e.currentTarget); renderQuestLog(); };
    }
    card.appendChild(btn);
    if (isCustom) {
      const del = el('button', 'mclose', '✕');
      del.style.position = 'static';
      del.onclick = () => { if (confirm('Remove this habit?')) Habits.removeCustom(def.id); };
      card.appendChild(del);
    }
    return card;
  }

  function showTimerStart(def) {
    const box = el('div', 'timer-wrap');
    box.innerHTML = `<h3>${icon(def.icon)} ${def.name}</h3>
      <p class="subtle">Pick a duration — the timer runs in real time.<br>${def.boost ? 'Completing it grants <b style="color:var(--gold)">x3 idle rewards</b> for twice the duration!' : 'Minutes become mana & essence, and water the garden.'}</p>
      <div class="preset-row"></div>
      <div class="mrow"></div>`;
    const row = box.querySelector('.preset-row');
    let sel = def.mins[1] || def.mins[0];
    for (const m of def.mins) {
      const p = el('button', 'preset' + (m === sel ? ' on' : ''), m + 'm');
      p.onclick = () => { sel = m; $$('.preset', row).forEach(x => x.classList.remove('on')); p.classList.add('on'); };
      row.appendChild(p);
    }
    const start = el('button', 'pixbtn gem', '<b>Begin</b>');
    start.onclick = () => {
      if (Habits.startTimer(def.id, sel)) { closeAllModals(); showTimerModal(); renderRituals(); }
    };
    box.querySelector('.mrow').appendChild(start);
    openModal(box);
  }

  function showTimerModal() {
    if (!S.exTimer) return;
    const def = Habits.defById(S.exTimer.hid);
    const box = el('div', 'timer-wrap');
    box.innerHTML = `<h3>${icon(def.icon)} ${def.name} — ${S.exTimer.mins} min</h3>
      <div class="timer-ring">
        <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="fill" cx="60" cy="60" r="52" stroke-dasharray="326.7" /></svg>
        <div class="timer-mid"><b id="tm-left">--:--</b><span>keep going!</span></div>
      </div>
      <p class="subtle">Stay with it — your beasts believe in you.<br>The timer keeps running if you close the app.</p>
      <div class="mrow"></div>`;
    const row = box.querySelector('.mrow');
    const give = el('button', 'pixbtn ghost sm', 'Abandon');
    give.onclick = () => { Habits.cancelTimer(); closeAllModals(); renderRituals(); toast('No guilt — try again when ready'); };
    row.appendChild(give);
    const back = openModal(box);
    back.dataset.timer = '1';
    updateTimerModal();
  }

  function updateTimerModal() {
    const back = $('#modal-root .modal-back[data-timer]');
    if (!back) return;
    if (!S.exTimer) { closeModal(back); return; }
    const total = S.exTimer.mins * 60;
    const left = Habits.timerRemaining() / 1000;
    const elLeft = back.querySelector('#tm-left');
    if (elLeft) elLeft.textContent = fmtTime(left);
    const circ = back.querySelector('.fill');
    if (circ) circ.style.strokeDashoffset = (326.7 * (1 - left / total));
  }

  function showAddCustomModal() {
    const box = el('div');
    const icons = ['star', 'book', 'scroll', 'water', 'sunrise', 'palette', 'crown', 'paw', 'relic', 'check'];
    box.innerHTML = `<h3>Create a habit</h3>
      <label>Name it</label>
      <input type="text" id="cr-name" maxlength="28" placeholder="e.g. Read 10 pages">
      <label>Pick an icon</label>
      <div class="preset-row" id="cr-icons"></div>
      <div class="mrow"></div>`;
    let sel = icons[0];
    const irow = box.querySelector('#cr-icons');
    icons.forEach(ic => {
      const b = el('button', 'preset' + (ic === sel ? ' on' : ''), icon(ic));
      b.onclick = () => { sel = ic; $$('.preset', irow).forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      irow.appendChild(b);
    });
    const ok = el('button', 'pixbtn good', '<b>Add habit</b>');
    ok.onclick = () => {
      const name = box.querySelector('#cr-name').value.trim();
      if (!name) { toast('Give it a name!'); return; }
      Habits.addCustom(name, sel);
      closeAllModals();
      toast('Habit added', 'good');
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box);
  }

  /* ================= login modal on new day ================= */
  function maybeShowLogin() {
    if (!S.onboarded) return;
    const idx = Quests.loginClaimable();
    if (idx < 0) return;
    const r = Quests.LOGIN[idx];
    const box = el('div', 'sreveal');
    box.innerHTML = `
      <div class="snew">DAY ${idx + 1} LOGIN REWARD</div>
      <div class="burst"><div class="rays"></div><div style="z-index:1;transform:scale(4)">${icon(r.icon, 'huge')}</div></div>
      <h2>${r.text}</h2>
      <div class="mrow"></div>`;
    const ok = el('button', 'pixbtn gold', '<b>Claim!</b>');
    ok.onclick = e => {
      const got = Quests.claimLogin();
      if (got) coinBurst(e.currentTarget, 6);
      closeAllModals();
      renderHud();
      if (activeTab === 'quests') renderQuests();
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box, { noClose: true });
  }

  /* ============================================================
     ONBOARDING — five questions that build your plan
     ============================================================ */
  function showOnboarding() {
    const draft = { key: null, level: 1, mins: 20, days: [1, 2, 3, 4, 5], why: '', starter: null };
    const box = el('div', 'onboard');
    const back = openModal(box, { noClose: true });
    let step = 0;
    const TOTAL = 6;

    function steps() {
      return `<div class="ob-steps">${Array.from({ length: TOTAL },
        (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
    }
    function nav(label, ok, onNext) {
      const row = el('div', 'mrow');
      if (step > 0) {
        const b = el('button', 'pixbtn ghost sm', 'Back');
        b.onclick = () => { step--; draw(); };
        row.appendChild(b);
      }
      const n = el('button', 'pixbtn primary', `<b>${label}</b>`);
      n.disabled = !ok;
      n.onclick = onNext;
      row.appendChild(n);
      box.appendChild(row);
      return n;
    }

    function draw() {
      box.innerHTML = '';
      box.scrollTop = 0;
      if (step === 0) drawIntro();
      else if (step === 1) drawDream();
      else if (step === 2) drawLevel();
      else if (step === 3) drawRhythm();
      else if (step === 4) drawWhy();
      else drawStarter();
    }

    /* 0 — what this is */
    function drawIntro() {
      box.innerHTML = steps() + `
        <h2>Dreamkeep</h2>
        <p>There is something you have always meant to get good at.<br>
        This is the app that actually makes you do it.</p>
        <p style="margin-top:10px">You will pick one dream. Every day it gives you
        <b>one concrete task</b> and a real timer. The minutes you actually put in
        are the only currency in the game — they hatch beasts, grow your garden
        and win your battles.</p>
        <p style="margin-top:10px;color:var(--gold)">Six quick questions.</p>`;
      nav('Let\'s go', true, () => { step = 1; draw(); });
    }

    /* 1 — the dream */
    function drawDream() {
      box.innerHTML = steps() + `
        <h2>What do you want to get good at?</h2>
        <p>Pick the one that pulls at you.</p>
        <div class="dream-grid"></div>`;
      const grid = box.querySelector('.dream-grid');
      for (const [key, d] of Object.entries(Dream.DREAMS)) {
        const c = el('div', 'dreamcard' + (draft.key === key ? ' on' : ''));
        c.innerHTML = `<span class="hob huge h-${d.art}"></span><div class="dname2">${d.name}</div>
          <div class="dblurb">${d.blurb}</div>`;
        c.onclick = () => {
          draft.key = key;
          $$('.dreamcard', grid).forEach(x => x.classList.remove('on'));
          c.classList.add('on');
          next.disabled = false;
          Sound.click();
        };
        grid.appendChild(c);
      }
      const next = nav('Next', !!draft.key, () => { step = 2; draw(); });
    }

    /* 2 — experience */
    function drawLevel() {
      const d = Dream.DREAMS[draft.key];
      box.innerHTML = steps() + `
        <h2>How far in are you?</h2>
        <p>Only changes which tasks you get.</p>
        <div class="lvl-list"></div>`;
      const list = box.querySelector('.lvl-list');
      Dream.LEVELS.forEach(l => {
        const c = el('div', 'lvlcard' + (draft.level === l.key ? ' on' : ''));
        c.innerHTML = `<span class="hob big h-${d.art}"></span>
          <div><div class="lvname">${l.name}</div><div class="lvdesc">${l.desc}</div></div>
          <div class="lvmin">${l.mins} min/day</div>`;
        c.onclick = () => {
          draft.level = l.key;
          draft.mins = l.mins;
          $$('.lvlcard', list).forEach(x => x.classList.remove('on'));
          c.classList.add('on');
          next.disabled = false;
          Sound.click();
        };
        list.appendChild(c);
      });
      const next = nav('Next', draft.level !== null, () => { step = 3; draw(); });
    }

    /* 3 — rhythm */
    function drawRhythm() {
      box.innerHTML = steps() + `
        <h2>Build the rhythm</h2>
        <p>Small and repeatable wins.</p>
        <label style="text-align:left;margin-top:10px">Minutes per session</label>
        <div class="preset-row" id="ob-mins"></div>
        <label style="text-align:left;margin-top:10px">Which days?</label>
        <div class="daypick"></div>
        <p class="subtle" id="ob-sum" style="margin-top:9px"></p>`;
      const mrow = box.querySelector('#ob-mins');
      [5, 10, 15, 20, 30, 45, 60].forEach(m => {
        const p = el('button', 'preset' + (m === draft.mins ? ' on' : ''), m + 'm');
        p.onclick = () => {
          draft.mins = m;
          $$('.preset', mrow).forEach(x => x.classList.remove('on'));
          p.classList.add('on');
          sum();
        };
        mrow.appendChild(p);
      });
      const dp = box.querySelector('.daypick');
      Dream.DAY_NAMES.forEach((n, i) => {
        const b = el('button', draft.days.includes(i) ? 'on' : '', n[0]);
        b.onclick = () => {
          if (draft.days.includes(i)) draft.days = draft.days.filter(x => x !== i);
          else draft.days.push(i);
          b.classList.toggle('on');
          sum();
        };
        dp.appendChild(b);
      });
      function sum() {
        const n = draft.days.length;
        const wk = n * draft.mins;
        box.querySelector('#ob-sum').innerHTML = n
          ? `${n} day${n > 1 ? 's' : ''} a week · <b style="color:var(--gold)">${wk} min</b> weekly
             · about <b style="color:var(--gold)">${(wk * 52 / 60).toFixed(0)} hours</b> in a year`
          : 'Pick at least one day.';
        if (next) next.disabled = n === 0;
      }
      const next = nav('Next', draft.days.length > 0, () => { step = 4; draw(); });
      sum();
    }

    /* 4 — why */
    function drawWhy() {
      const d = Dream.DREAMS[draft.key];
      box.innerHTML = steps() + `
        <h2>Why this one?</h2>
        <p>On the days you don't feel like it, you'll read this.</p>
        <input type="text" id="ob-why" maxlength="150" placeholder="e.g. so I can play at my sister's wedding">
        <p class="subtle" style="margin-top:8px">Optional — skip it if you like.</p>`;
      const inp = box.querySelector('#ob-why');
      inp.value = draft.why;
      nav('Next', true, () => { draft.why = inp.value.trim(); step = 5; draw(); });
      setTimeout(() => inp.focus(), 80);
    }

    /* 5 — starter matched to the dream's element */
    function drawStarter() {
      S.dream.key = draft.key;               // so Dream.def() resolves
      const d = Dream.DREAMS[draft.key];
      const options = Dream.starterOptions();
      box.innerHTML = steps() + `
        <h2>Pick your companion</h2>
        <p>These three share the <b>${d.element}</b> affinity of ${d.name}.<br>
        A matching beast gains <b>80% more XP</b> from every session you finish.</p>
        <div class="starter-row"></div>`;
      const row = box.querySelector('.starter-row');
      for (const cid of options) {
        const c = C_BY_ID[cid];
        const card = el('div', 'startercard' + (draft.starter === cid ? ' on' : ''));
        const evo = c.line ? LINES[c.line].length : 1;
        card.innerHTML = `<img src="${sprite(cid)}"><div class="sname">${c.name}</div>
          <div>${typeBadges(c.types)}</div>
          <div class="subtle" style="margin-top:4px">${evo}-stage line</div>`;
        fitSprite(card.querySelector('img'), cid, 82);
        card.onclick = () => {
          draft.starter = cid;
          $$('.startercard', row).forEach(x => x.classList.remove('on'));
          card.classList.add('on');
          next.disabled = false;
          Sound.click();
        };
        row.appendChild(card);
      }
      const next = nav('Begin', !!draft.starter, finish);
    }

    function finish() {
      Dream.setup(draft.key, draft.level, draft.mins, draft.days, draft.why);
      S.starterCid = draft.starter;
      ownBeast(draft.starter);
      S.beasts[draft.starter].level = 3;
      S.onboarded = true;
      Quests.generateToday();
      save();
      closeModal(back);
      confetti(60);
      Sound.levelup();
      switchTab('today');
      renderAll();
      const d = Dream.DREAMS[draft.key];
      toast(`${C_BY_ID[draft.starter].name} joins you. ${d.name} starts today.`, 'gold');
      setTimeout(maybeShowLogin, 1000);
      setTimeout(() => toast('Tap "Start" on the focus card when you are ready', 'mana'), 3600);
    }

    draw();
  }

  /* XP is visible as it arrives, rising off the level chip */
  let xpQueue = 0, xpTimer = null;
  function floatXp(n) {
    xpQueue += n;
    if (xpTimer) return;
    xpTimer = setTimeout(() => {
      const amount = xpQueue; xpQueue = 0; xpTimer = null;
      const chip = $('#hud-level');
      if (!chip || amount <= 0) return;
      const r = chip.getBoundingClientRect();
      const f = el('div', 'dmg-float xp-f', '+' + fmt(amount) + ' XP');
      f.style.cssText = `position:fixed;left:${r.left + r.width / 2 - 18}px;` +
                        `top:${r.bottom - 4}px;z-index:300`;
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 1200);
      chip.classList.remove('xp-pulse'); void chip.offsetWidth; chip.classList.add('xp-pulse');
    }, 400);                        // batch a burst of gains into one number
  }

  /* Levelling up now tells you what it handed you. */
  function showLevelUp(lvl) {
    const rewards = levelRewards(lvl);
    const cid = heroBeastId();
    const box = el('div', 'sreveal levelup');
    box.innerHTML = `
      <div class="snew">LEVEL UP</div>
      <h2>Level ${lvl}</h2>
      ${cid ? `<div class="burst"><div class="rays"></div><img src="${sprite(cid)}"></div>` : ''}
      <div class="lu-rows"></div>
      <div class="mrow"></div>`;
    if (cid) fitSprite(box.querySelector('.burst img'), cid, 116);
    const rows = box.querySelector('.lu-rows');
    const add = (txt, kind) => {
      const r = el('div', 'lu-row ' + (kind || ''));
      r.innerHTML = `<span class="lu-tick"></span><span>${txt}</span>`;
      rows.appendChild(r);
    };
    add(`Party health and damage up`, 'stat');
    add(`Combat power now <b>${fmt(Battle.combatPower())}</b>`, 'stat');
    for (const r of rewards) add(r, 'unlock');
    if (!rewards.length) {
      const nextAt = Object.keys(LEVEL_REWARDS).map(Number).filter(l => l > lvl).sort((a, b) => a - b)[0];
      if (nextAt) add(`Next unlock at level ${nextAt}`, 'soon');
    }
    const ok = el('button', 'pixbtn gold', '<b>Nice</b>');
    ok.onclick = () => { closeAllModals(); renderAll(); };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box, { noClose: true });
    Sound.levelup();
    rows.querySelectorAll('.lu-row').forEach((r, i) => { r.style.animationDelay = (i * 110) + 'ms'; });
  }

  /* ================= settings / welcome ================= */
  function showSettings() {
    const box = el('div');
    box.innerHTML = `<h3>Settings</h3><div class="mrow" style="flex-direction:column;align-items:stretch"></div>`;
    const row = box.querySelector('.mrow');
    const snd = el('button', 'pixbtn ghost sm', (S.settings.sound ? 'Sound: ON' : 'Sound: OFF'));
    snd.onclick = () => {
      S.settings.sound = !S.settings.sound;
      Sound.setEnabled(S.settings.sound);
      snd.textContent = S.settings.sound ? 'Sound: ON' : 'Sound: OFF';
      save();
    };
    row.appendChild(snd);
    const plan = el('button', 'pixbtn ghost sm', 'Change my plan');
    plan.onclick = () => { closeAllModals(); showPlanEditor(); };
    row.appendChild(plan);
    const reset = el('button', 'pixbtn ghost sm', 'Reset all progress');
    reset.onclick = () => { if (confirm('Really erase your entire journey? This cannot be undone.')) hardReset(); };
    row.appendChild(reset);
    const about = el('p', 'subtle');
    about.style.textAlign = 'center';
    about.style.marginTop = '10px';
    about.innerHTML = 'Dreamkeep — the hours you really put in power a whole world.<br>' +
      'Be kind to yourself. Missing a day is part of the journey.';
    box.appendChild(about);
    openModal(box);
  }

  /* edit the plan without wiping progress */
  function showPlanEditor() {
    const box = el('div', 'onboard');
    box.innerHTML = `
      <h2>Your plan</h2>
      <p>${Dream.def().name} · ${Dream.levelDef().name}</p>
      <label style="text-align:left;margin-top:10px">Minutes per session</label>
      <div class="preset-row" id="pe-mins"></div>
      <label style="text-align:left;margin-top:10px">Which days?</label>
      <div class="daypick"></div>
      <label style="text-align:left;margin-top:10px">Why you are doing it</label>
      <input type="text" id="pe-why" maxlength="150" value="${(S.dream.why || '').replace(/"/g, '&quot;')}">
      <div class="mrow"></div>`;
    let mins = S.dream.mins, days = (S.dream.days || []).slice();
    const mrow = box.querySelector('#pe-mins');
    [5, 10, 15, 20, 30, 45, 60].forEach(m => {
      const p = el('button', 'preset' + (m === mins ? ' on' : ''), m + 'm');
      p.onclick = () => { mins = m; $$('.preset', mrow).forEach(x => x.classList.remove('on')); p.classList.add('on'); };
      mrow.appendChild(p);
    });
    const dp = box.querySelector('.daypick');
    Dream.DAY_NAMES.forEach((n, i) => {
      const b = el('button', days.includes(i) ? 'on' : '', n[0]);
      b.onclick = () => {
        if (days.includes(i)) days = days.filter(x => x !== i); else days.push(i);
        b.classList.toggle('on');
      };
      dp.appendChild(b);
    });
    const ok = el('button', 'pixbtn primary', '<b>Save plan</b>');
    ok.onclick = () => {
      if (!days.length) { toast('Pick at least one day'); return; }
      S.dream.mins = mins;
      S.dream.days = days;
      S.dream.why = box.querySelector('#pe-why').value.trim().slice(0, 160);
      save();
      closeAllModals();
      toast('Plan updated', 'good');
      renderToday();
    };
    box.querySelector('.mrow').appendChild(ok);
    const swap = el('button', 'pixbtn ghost sm', 'Chase a different dream');
    swap.onclick = () => {
      if (!confirm('Switch dreams? Your hours and rank on this one are kept, but the ladder restarts.')) return;
      closeAllModals();
      showDreamSwap();
    };
    box.querySelector('.mrow').appendChild(swap);
    openModal(box);
  }

  function showDreamSwap() {
    const box = el('div', 'onboard');
    box.innerHTML = `<h2>Pick a new dream</h2>
      <p>Your beasts, gold and garden all come with you.</p>
      <div class="dream-grid"></div>`;
    const grid = box.querySelector('.dream-grid');
    for (const [key, d] of Object.entries(Dream.DREAMS)) {
      const c = el('div', 'dreamcard' + (S.dream.key === key ? ' on' : ''));
      c.innerHTML = `<span class="hob huge h-${d.art}"></span><div class="dname2">${d.name}</div>
        <div class="dblurb">${d.blurb}</div>`;
      c.onclick = () => {
        S.dream.key = key;
        S.dream.taskSkips = 0;
        save();
        closeAllModals();
        toast(`Now chasing ${d.name}.`, 'gold');
        renderAll();
      };
      grid.appendChild(c);
    }
    openModal(box);
  }

  function showWelcomeBack(seconds, gains) {
    const box = el('div', 'wback');
    const boosted = isExerciseBoost();
    box.innerHTML = `
      <h3>Welcome back!</h3>
      <p class="subtle">Your party fought bravely for ${fmtTime(seconds)}.</p>
      <div class="wbig">${icon('gold', 'big')} +${fmt(gains.gold)}</div>
      <p class="subtle">${fmt(gains.kills)} beasts defeated${boosted ? ' — x3 exercise boost applied!' : ''}</p>
      <div class="mrow"></div>`;
    const ok = el('button', 'pixbtn gold', '<b>Collect</b>');
    ok.onclick = e => {
      grantGold(gains.gold, e.currentTarget);
      grantPlayerXp(gains.xp);
      grantBeastXp(gains.xp);
      S.kills += gains.kills;
      Sound.coin();
      save();
      renderHud();
      closeAllModals();
      setTimeout(maybeShowLogin, 400);
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box, { noClose: true });
  }

  /* ================= global ================= */
  function renderAll() {
    applyBuddyTheme();
    renderHud();
    renderScene();
    renderBattleStats();
    renderQuestLog();
    renderUpgrades();
    renderMerge();
    if (S.dream && S.dream.key) renderToday();
    if (activeTab === 'beasts') renderBeasts();
    if (activeTab === 'summon') renderSummon();
    if (activeTab === 'farm') renderFarm();
    if (activeTab === 'quests') renderQuests();
  }

  return {
    switchTab, currentTab, renderAll, renderHud, renderScene, renderSceneBg,
    renderToday, renderFocus, renderRhythm, renderJournal,
    startSession, openSessionOverlay, tickSession, showSessionSetup,
    renderSessionBattle,
    renderEnemies, renderEnemyHp, renderBossTimer, renderPartyHp, renderParty,
    renderBattleStats, renderBoost, showHit, showKillRewards, attackTween,
    enemyLunge, showPartyHit, lightAttack, chargeAttack, startAdvance, renderUltMeter, showUltimateCast, skillFlash,
    showDefeat, hideDefeat, showEncounter, renderQuestLog, renderUpgrades,
    renderCooldowns, tickCooldowns, renderPanels, togglePanel,
    renderMerge, mergeSpawnFx, mergeFuseFx, showMap,
    renderBeasts, renderCollection, showCreature, showFeedPicker,
    renderFarm, waterGarden, showMealModal, showKcalTargetModal, renderFood,
    renderSummon, playWish, showSummonReveal,
    renderQuests, renderRituals, markQuestDot, maybeShowLogin,
    showTimerModal, updateTimerModal, showAddCustomModal,
    showSettings, showPlanEditor, showOnboarding, showWelcomeBack,
    floatXp, showLevelUp,
  };
})();
