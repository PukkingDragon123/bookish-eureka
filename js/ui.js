/* ============ Ritual Beasts — UI v3 ============ */
'use strict';

const UI = (() => {
  let activeTab = 'battle';
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

  /* ================= HUD ================= */
  function renderHud() {
    $('#hud-lvl-num').textContent = S.player.level;
    $('#hud-xp-fill').style.width = (100 * S.player.xp / xpForLevel(S.player.level)) + '%';
    $('#hud-gold').textContent = fmt(S.player.gold);
    $('#hud-gems').textContent = fmt(S.player.gems);
    $('#hud-mana').textContent = fmt(S.player.mana);
    $('#hud-mana-fill').style.width = (100 * S.player.mana / manaMax()) + '%';
    $('#hud-ess').textContent = fmt(S.player.essence);
    $('#hud-lab').textContent = fmt(S.lab.points);
    $('#hud-streak').textContent = S.streak.count;
  }

  /* ================= tabs ================= */
  function switchTab(name) {
    activeTab = name;
    $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    Sound.click();
    if (name === 'beasts') renderBeasts();
    if (name === 'summon') renderSummon();
    if (name === 'farm') renderFarm();
    if (name === 'quests') { renderQuests(); markQuestDot(false); }
    if (name === 'battle') { renderQuestLog(); renderUpgrades(); renderMerge(); }
  }
  function currentTab() { return activeTab; }

  function markQuestDot(on) {
    const btn = $('#tabbar button[data-tab=quests]');
    let dot = btn.querySelector('.dot');
    if (on && !dot) btn.appendChild(el('i', 'dot'));
    if (!on && dot) dot.remove();
  }

  /* ================= battle scene ================= */
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

  /* ----- enemies (packs of 1-3) ----- */
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

  function showHit(target, dmg, crit, vfx, label) {
    const p = foePoint(target);
    if (!p) return;
    floatText(fmt(dmg), p.x, p.y - 26, crit ? 'crit' : '');
    const d = foeEl(target);
    if (d) {
      const img = d.querySelector('img');
      img.classList.remove('hit'); void img.offsetWidth; img.classList.add('hit');
    }
    if (vfx) VFX.cast(vfx, p.x, p.y, crit ? 1.5 : 1);
    else VFX.hit(p.x, p.y, 'metal', crit);
    if (label) skillFlash(label, false);
  }

  /* fighter dashes toward the target, damage lands mid-dash */
  function attackTween(cid, target, onImpact) {
    const i = S.party.indexOf(cid);
    const f = $$('#party-holder .fighter')[i < 0 ? 0 : i];
    if (f) {
      f.classList.remove('attack'); void f.offsetWidth; f.classList.add('attack');
    }
    setTimeout(onImpact, 160);
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
  }

  function renderPartyHp(frac) {
    const pct = clamp(frac * 100, 0, 100);
    const col = frac < 0.35 ? 'var(--hp)' : frac < 0.6 ? 'var(--xp)' : 'var(--good)';
    $$('#party-holder .fhp > i').forEach(i => {
      i.style.width = pct + '%';
      i.style.background = col;
    });
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
    if (f) { f.classList.remove('attack'); void f.offsetWidth; f.classList.add('attack'); }
    const first = Battle.enemies.filter(e => !e.dying)[0];
    const p = first ? foePoint(first) : null;
    if (p) VFX.ultimate(p.x, p.y, ult.vfx);
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
    setTimeout(hideDefeat, 5000);
  }
  function hideDefeat() { $('#defeat-overlay').classList.add('hidden'); }

  /* ----- roadside encounter minigame ----- */
  let encTimer = null;
  function showEncounter() {
    const o = $('#encounter-overlay');
    if (!o.classList.contains('hidden')) return;
    o.classList.remove('hidden');
    let taps = 0, hits = 0;
    o.innerHTML = `
      <h3>${icon('chest')} A buried cache!</h3>
      <div class="enc-sub">Tap when the light crosses the gold zone — 3 tries.</div>
      <div class="enc-bar"><div class="zone"></div><div class="zone sweet"></div><div class="cursor"></div></div>
      <div class="enc-hits"></div>`;
    const bar = o.querySelector('.enc-bar');
    const cursor = o.querySelector('.cursor');
    const zone = o.querySelector('.zone');
    const sweet = o.querySelector('.zone.sweet');
    const hitsEl = o.querySelector('.enc-hits');
    const z0 = rnd(30, 55), zw = 24, sw = 8;
    zone.style.left = z0 + '%'; zone.style.width = zw + '%';
    sweet.style.left = (z0 + zw / 2 - sw / 2) + '%'; sweet.style.width = sw + '%';
    let t0 = performance.now();
    const speed = 1100;
    function anim(now) {
      const t = ((now - t0) % speed) / speed;
      const x = t < 0.5 ? t * 2 : (1 - t) * 2;
      cursor.style.left = (x * 96) + '%';
      if (!o.classList.contains('hidden')) requestAnimationFrame(anim);
    }
    requestAnimationFrame(anim);
    bar.onclick = () => {
      if (taps >= 3) return;
      taps++;
      const cx = parseFloat(cursor.style.left);
      const inSweet = cx >= z0 + zw / 2 - sw / 2 - 1 && cx <= z0 + zw / 2 + sw / 2 - 1;
      const inZone = cx >= z0 - 1 && cx <= z0 + zw - 1;
      if (inSweet) { hits += 2; hitsEl.textContent += ' PERFECT!'; Sound.quest(); }
      else if (inZone) { hits += 1; hitsEl.textContent += ' good.'; Sound.coin(); }
      else { hitsEl.textContent += ' miss…'; Sound.hit(); }
      if (taps >= 3) {
        clearTimeout(encTimer);
        setTimeout(() => finishEncounter(hits), 500);
      }
    };
    clearTimeout(encTimer);
    encTimer = setTimeout(() => finishEncounter(hits), 9000);
  }
  function finishEncounter(hits) {
    const o = $('#encounter-overlay');
    if (o.classList.contains('hidden')) return;
    o.classList.add('hidden');
    const gold = grantGold(Math.floor((30 + hits * 45) * Math.pow(1.2, globalStage())));
    const bits = [`+${fmt(gold)} gold`];
    if (hits >= 3) { grantSeeds(1); bits.push('+1 seed'); }
    if (hits >= 5) { grantLabPoints(2); bits.push('+2 lab pts'); }
    toast(`Cache opened: ${bits.join(', ')}`, 'gold');
    confetti(16);
    renderHud();
  }

  /* ----- quest log on the battle screen ----- */
  function renderQuestLog() {
    const w = $('#quest-log');
    if (!w) return;
    Quests.generateToday();
    const open = (S.quests.list || []).filter(q => !q.claimed).slice(0, 2);
    const ch = Quests.todaysChallenge();
    let html = '';
    if (!S.challenge.done) {
      html += `<div class="qlog-row">${icon('star')} <b>${ch.name}</b></div>`;
    }
    for (const q of open) {
      const done = q.progress >= q.target;
      html += `<div class="qlog-row ${done ? 'done-row' : ''}">${icon(q.icon)} ${q.name}
        <span class="pixbar good"><i style="width:${100 * q.progress / q.target}%"></i></span>
        <b>${q.progress}/${q.target}</b></div>`;
    }
    if (!html) html = `<div class="qlog-row">${icon('check')} All of today's quests are done. Legend.</div>`;
    w.innerHTML = html;
  }

  /* ----- cookie-clicker upgrades ----- */
  function renderUpgrades() {
    const strip = $('#upgrade-strip');
    if (!strip) return;
    strip.innerHTML = '';
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
    Merge.regen();
    board.innerHTML = '';
    S.merge.board.forEach((it, i) => {
      const slot = el('div', 'mslot');
      slot.dataset.i = i;
      if (it) {
        const item = el('div', `mitem t-${it.cat}` + (it.tier >= 5 ? ' hi-tier' : ''));
        item.dataset.v = it.variant;
        item.innerHTML = `<span class="var-dot"></span>${icon(MERGE_CATS[it.cat].icon)}<span class="tier">T${it.tier}</span>`;
        item.title = Merge.itemName(it);
        attachDrag(item, i);
        slot.appendChild(item);
      }
      slot.onclick = () => tapSlot(i);
      board.appendChild(slot);
    });
    const t = Merge.totals();
    $('#merge-bonuses').innerHTML =
      `${icon('sword')}<b>+${t.dmg.toFixed(0)}%</b> ${icon('shield')}<b>+${t.hp.toFixed(0)}%</b> ${icon('gold')}<b>+${t.gold.toFixed(0)}%</b>`;
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
      ghost = el('div', 'merge-ghost ' + item.className.replace('mitem', 'mitem'));
      ghost.className = 'merge-ghost mitem t-' + S.merge.board[from].cat;
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
    if (p) {
      // portal swirl in fixed coords -> reuse confetti-ish float
      const f = el('div', 'dmg-float mana-f', '+');
      f.style.position = 'fixed'; f.style.left = p.x + 'px'; f.style.top = p.y + 'px'; f.style.zIndex = 300;
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 800);
    }
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
      d.innerHTML = `${unlocked ? '' : `<span class="rlock">${icon('lock')}</span>`}
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
        d = el('div', 'pslot empty', icon('plus', 'big'));
        d.onclick = () => toast('Pick a beast from your dex below');
      } else {
        const need = i === 1 ? 3 : i === 2 ? 6 : 12;
        d = el('div', 'pslot locked', `${icon('lock', 'big')}<span class="pname">Lv.${need}</span>`);
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
        o === 'all' ? 'All' : o === 'owned' ? 'Owned' : icon(TYPE_ICONS[o]) + ' ' + o);
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

    const skills = kit.skills.map(sk => `
      <div class="skillrow">
        <div class="sicon" style="background:${TYPE_COLORS[sk.type] || '#666'}">${icon(TYPE_ICONS[sk.type] || 'sword')}</div>
        <div><div class="sname">${sk.name}</div><div class="sdesc">${sk.desc}</div>
        <div class="smeta">${Math.round(sk.power * 100)}% power · ${sk.cd}s cooldown · ${sk.type}</div></div>
      </div>`).join('');

    let graftHtml = '';
    if (owned && inst.graft && C_BY_ID[inst.graft]) {
      const g = Lore.kit(inst.graft).skills[1];
      graftHtml = `<div class="skillrow graftrow">
        <div class="sicon" style="background:${TYPE_COLORS[g.type] || '#666'}">${icon('flask')}</div>
        <div><div class="sname">${g.name} <span class="subtle">(grafted)</span></div>
        <div class="sdesc">Lab-grafted from ${C_BY_ID[inst.graft].name}.</div>
        <div class="smeta">${Math.round(g.power * 100)}% power · ${(g.cd * 1.4).toFixed(1)}s cooldown</div></div>
      </div>`;
    }

    const u = kit.ult;
    const ultHtml = `<div class="skillrow ultrow">
      <div class="sicon" style="background:${TYPE_COLORS[u.type] || '#666'}">${icon(TYPE_ICONS[u.type] || 'star')}</div>
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

    box.innerHTML = `
      <div class="crarity ${c.rarity}">${c.rarity}</div>
      <h3>${c.name}</h3>
      <div>${typeBadges(c.types)}</div>
      <div class="cimg-wrap"><img class="main" src="${assetUrl('assets/creatures/' + c.file)}" alt="${c.name}"></div>
      <div class="dexbox"><span class="dexlabel">DEX ENTRY No.${c.id}</span>${kit.dex}</div>
      ${owned ? `
      <div class="cstats">
        <div class="cstat"><span>Level</span><b>${st.lvl}</b></div>
        <div class="cstat"><span>HP</span><b>${fmt(st.hp)}</b></div>
        <div class="cstat"><span>Attack</span><b>${fmt(st.atk)}</b></div>
        <div class="cstat"><span>Speed</span><b>${st.spd}</b></div>
      </div>
      ${mutBits ? `<div class="mutline">${icon('flask')} Lab mutations: ${mutBits}</div>` : ''}
      <div class="pixbar xp" style="margin-top:6px" title="XP from feeding & battles">
        <i style="width:${Math.min(100, 100 * inst.xp / beastXpNeed(lvl))}%"></i></div>`
      : '<p class="subtle" style="margin-top:6px">Not yet bonded — summon or evolve to recruit.</p>'}
      <div class="sectitle">${icon('sword')} Skills</div>${skills}${graftHtml}
      <div class="sectitle">${icon('star')} Ultimate</div>${ultHtml}
      <div class="sectitle">${icon('shield')} Passives</div>${passes}
      ${evoHtml ? `<div class="sectitle">${icon('paw')} Evolution line</div>${evoHtml}` : ''}
      <div class="mrow" id="cd-actions"></div>`;

    const img = box.querySelector('.cimg-wrap img');
    fitSprite(img, cid, 116);

    const back = openModal(box);
    const actions = box.querySelector('#cd-actions');
    if (!owned) return;

    // feed
    const feedB = el('button', 'pixbtn good sm');
    feedB.innerHTML = `<b>Feed</b><span>${icon('meal')} ${Farm.totalFood()} food</span>`;
    feedB.disabled = Farm.totalFood() <= 0;
    feedB.onclick = () => showFeedPicker(cid, () => { closeModal(back); showCreature(cid); });
    actions.appendChild(feedB);

    // gold level-up
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
      save(); renderParty(); renderBeasts();
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
      opt.innerHTML = `${icon(food.icon, 'big')}<span>${food.name}</span><b>x${have}</b>`;
      opt.onclick = e => {
        if (Farm.feed(cid, elName, e.currentTarget)) {
          VFX.hearts && null;
          closeAllModals();
          if (after) after();
          renderHud();
        }
      };
      grid.appendChild(opt);
    }
    if (!any) box.appendChild(el('p', 'pantry-empty', 'The pantry is empty — grow crops at the Farm.'));
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

  /* ================= farm tab ================= */
  function renderFarm() {
    $('#farm-seeds').textContent = S.farm.seeds;
    const wrap = $('#farm-plots');
    wrap.innerHTML = '';
    S.farm.plots.forEach((p, i) => {
      const d = el('div', 'plot' + (Farm.ready(p) ? ' ready' : '') + (p.el ? '' : ' empty-plot'));
      if (!p.el) {
        d.innerHTML = `<span class="stagec">${icon('seed', 'big')}</span><span class="ptime">plant a seed</span>`;
        d.onclick = () => showPlantModal(i);
      } else if (Farm.ready(p)) {
        d.innerHTML = `<span class="stagec sprout">${icon(FOODS[p.el].icon, 'huge')}</span><span class="ptime">HARVEST!</span>`;
        d.onclick = e => Farm.harvest(i, e.currentTarget);
      } else {
        const rem = Farm.remaining(p);
        const frac = 1 - rem / (Farm.growMs(p.el));
        const stageIcon = frac < 0.5 ? icon('seed', 'big') : icon('leaf', 'big');
        d.innerHTML = `<span class="stagec sprout">${stageIcon}</span><span class="ptime">${FOODS[p.el].name} · ${fmtTime(rem / 1000)}</span>`;
        d.onclick = () => toast(`${FOODS[p.el].name} needs ${fmtTime(Farm.remaining(p) / 1000)} — quests water the field!`);
      }
      wrap.appendChild(d);
    });
    // pantry
    const pan = $('#pantry');
    pan.innerHTML = '';
    let total = 0;
    for (const [elName, food] of Object.entries(FOODS)) {
      const n = S.farm.food[elName] || 0;
      if (!n) continue;
      total += n;
      const chip = el('button', 'food-chip', `${icon(food.icon)} ${food.name} <b>x${n}</b>`);
      chip.onclick = () => showFeedTarget(elName);
      pan.appendChild(chip);
    }
    $('#pantry-count').textContent = total ? `${total} food — tap to feed` : '';
    if (!total) pan.appendChild(el('p', 'pantry-empty', 'Nothing harvested yet. Crops grow in real time — even while you are away.'));
    renderFood();
  }

  function showPlantModal(plotI) {
    if (S.farm.seeds <= 0) {
      toast('No seeds! Log a real meal (name + calories) to earn seeds.', 'mana');
      return;
    }
    const box = el('div');
    box.innerHTML = `<h3>${icon('seed')} Plant a crop</h3>
      <p class="subtle" style="text-align:center">Seeds: ${S.farm.seeds} — each crop feeds one element.</p>
      <div class="feed-grid"></div>`;
    const grid = box.querySelector('.feed-grid');
    for (const [elName, food] of Object.entries(FOODS)) {
      const opt = el('button', 'feed-opt');
      opt.innerHTML = `${icon(food.icon, 'big')}<span>${food.name}</span><b>${food.mins}min</b>`;
      opt.onclick = () => {
        if (Farm.plant(plotI, elName)) closeAllModals();
      };
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
      <label class="photo-label" id="photo-lab">${icon('palette')} <span id="photo-txt">Add a photo (+1 seed)</span>
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
    element: null,   // resolved per element below
    radiant: { cid: '13_08', from: '#7a5a1e', to: '#4a3010' },
  };
  const ELEM_BANNER_ART = {
    Fire: { cid: '13_05', from: '#8a3a1e', to: '#4a1a0c' },
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
        <div class="bstars">${icon('star')}${icon('star')}</div>
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
    $('#lab-points').textContent = S.lab.points;
    $('#lab-cost').textContent = Lab.COST;
    // relics
    const shelf = $('#relic-shelf');
    shelf.innerHTML = '';
    for (const r of RELICS) {
      const n = S.relics[r.id] || 0;
      const d = el('div', 'relic' + (n ? ' owned' : ''));
      d.innerHTML = `${icon(n ? r.icon : 'lock', 'big')}<span class="rname">${n ? r.name : '???'}</span>` +
        `<span class="rbonus">${n ? r.desc + (n > 1 ? ` x${n}` : '') : 'undiscovered'}</span>`;
      shelf.appendChild(d);
    }
  }

  /* ----- wish animation + results ----- */
  function playWish(banner, results) {
    const o = $('#wish-overlay');
    o.classList.remove('hidden');
    o.innerHTML = '<canvas></canvas><div class="wish-tap">tap to skip</div>';
    const cv = o.querySelector('canvas');
    cv.width = o.clientWidth; cv.height = o.clientHeight;
    const ctx = cv.getContext('2d');
    const best = results.reduce((m, r) => {
      const ri = r.c ? RARITY_ORDER.indexOf(r.c.rarity) : 2;
      return Math.max(m, ri);
    }, 0);
    const color = best >= 4 ? '#ffce4f' : best >= 3 ? '#bd8bff' : best >= 2 ? '#5aa2e8' : '#c7d4e8';
    let t0 = performance.now(), done = false;
    const trail = [];
    function frame(now) {
      if (done) return;
      const t = (now - t0) / 1100;
      ctx.fillStyle = 'rgba(18,10,4,.32)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      const x = cv.width * (t * 1.15 - 0.06);
      const y = cv.height * (0.72 - 0.45 * t) + Math.sin(t * 9) * 14;
      trail.push({ x, y });
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const s = 3 + (i / trail.length) * 9;
        ctx.fillStyle = i === trail.length - 1 ? '#fff' : color;
        ctx.globalAlpha = i / trail.length;
        ctx.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, s, s);
      }
      ctx.globalAlpha = 1;
      if (t >= 1) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, cv.width, cv.height);
        setTimeout(() => { if (!done) closeWish(); }, 120);
        return;
      }
      requestAnimationFrame(frame);
    }
    function closeWish() {
      done = true;
      o.classList.add('hidden');
      o.innerHTML = '';
      showPullResults(banner, results);
    }
    o.onclick = closeWish;
    requestAnimationFrame(frame);
    Sound.summon();
  }

  function showPullResults(banner, results) {
    if (results.length === 1) {
      const r = results[0];
      if (r.relic) return showRelicReveal(r.relic);
      return showSummonReveal(r.c, r.isNew, r.dup, banner);
    }
    const box = el('div', 'sreveal');
    box.innerHTML = `<div class="snew">${banner.name.toUpperCase()} — 10 PULL</div><div class="pull-grid"></div><div class="mrow"></div>`;
    const grid = box.querySelector('.pull-grid');
    results.forEach((r, i) => {
      const cell = el('div', 'pull-cell' + (r.c && ['rare', 'epic', 'legendary'].includes(r.c.rarity) ? ' r-' + r.c.rarity : ''));
      if (r.relic) {
        cell.innerHTML = `${icon(r.relic.icon, 'big')}<span>${r.relic.name}</span>`;
      } else {
        cell.innerHTML = `<img src="${assetUrl('assets/creatures/' + r.c.file)}">
          <span>${r.c.name}</span>${r.isNew ? '<span class="pnew">NEW!</span>' : `<span class="subtle">+${r.dup ? r.dup.ess : 0}${' '}ess</span>`}`;
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

  function showRelicReveal(r) {
    const box = el('div', 'sreveal');
    box.innerHTML = `
      <div class="snew">RELIC FOUND</div>
      <div class="burst"><div class="rays"></div><div style="z-index:1;transform:scale(4)">${icon(r.icon, 'huge')}</div></div>
      <h2>${r.name}</h2>
      <p class="subtle">${r.desc} — permanent blessing${(S.relics[r.id] || 0) > 1 ? `, now x${S.relics[r.id]}` : ''}.</p>`;
    openModal(box);
    confetti(30);
  }

  /* ----- lab ----- */
  function runLab() {
    const res = Lab.roll();
    if (!res) return;
    renderHud();
    $('#lab-points').textContent = S.lab.points;
    const box = el('div', 'sreveal');
    box.innerHTML = `
      <div class="snew">${res.title}</div>
      <div class="burst"><div class="rays"></div>
        ${res.cid ? `<img src="${assetUrl('assets/creatures/' + C_BY_ID[res.cid].file)}">` : `<div style="z-index:1;transform:scale(4)">${icon(res.icon, 'huge')}</div>`}
      </div>
      <p style="font-size:11px;line-height:1.7;padding:0 6px">${res.text}</p>
      <div class="mrow"></div>`;
    if (res.cid) fitSprite(box.querySelector('.burst img'), res.cid, 130);
    const again = el('button', 'pixbtn primary sm');
    again.innerHTML = `<b>Again</b><span>${icon('flask')} ${Lab.COST}</span>`;
    again.disabled = S.lab.points < Lab.COST;
    again.onclick = () => { closeAllModals(); runLab(); };
    box.querySelector('.mrow').appendChild(again);
    confetti(26);
    openModal(box);
  }

  /* ================= quests tab ================= */
  function renderQuests() {
    Quests.generateToday();
    renderLoginRow();
    renderChallenge();
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
          <span class="pixbar good"><i style="width:${100 * q.progress / q.target}%"></i></span>
          <div class="qprog-txt">${q.progress}/${q.target} ${rw.join(' ')}</div>
        </div>`;
      const btn = el('button', 'qclaim pixbtn gold tiny', q.claimed ? 'Claimed' : 'Claim');
      btn.disabled = !done || q.claimed;
      btn.onclick = e => Quests.claim(q.qid, e.currentTarget);
      card.appendChild(btn);
      wrap.appendChild(card);
    }
    // journey
    const j = $('#journey-panel');
    j.innerHTML = '';
    const stats = [
      ['streak', 'Current streak', S.streak.count + ' day' + (S.streak.count === 1 ? '' : 's')],
      ['sword', 'Beasts defeated', fmt(S.kills)],
      ['skull', 'Bosses slain', fmt(S.bossKills)],
      ['paw', 'Companions bonded', Object.keys(S.beasts).length],
      ['flask', 'Experiments run', S.lab.rolls || 0],
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
      const claimed = i < cur || (claimIdx < 0 && i === cur - 1 && cur > 0);
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

  function renderChallenge() {
    const wrap = $('#challenge-card');
    const ch = Quests.todaysChallenge();
    const done = S.challenge.done;
    wrap.innerHTML = '';
    const card = el('div', 'challenge' + (done ? ' done-ch' : ''));
    card.innerHTML = `
      <div class="cic">${icon(ch.icon, 'big')}</div>
      <div style="flex:1;min-width:0">
        <div class="cname">${done ? 'DONE: ' : ''}${ch.name}</div>
        <div class="cdesc">${ch.desc}</div>
        <div class="crew">${icon('flask')} +${Quests.CHALLENGE_REWARD.lp} lab pts ${icon('gem')} +${Quests.CHALLENGE_REWARD.gems} gems · waters the farm</div>
        <div class="cbtns"></div>
      </div>`;
    const btns = card.querySelector('.cbtns');
    if (ch.link) {
      const a = el('a', 'pixbtn gem tiny');
      a.href = ch.link; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = `${icon('map')} Open`;
      btns.appendChild(a);
    }
    if (!done) {
      const b = el('button', 'pixbtn gold tiny', 'I did it!');
      b.onclick = e => { Quests.completeChallenge(e.currentTarget); };
      btns.appendChild(b);
    }
    wrap.appendChild(card);
  }

  /* daily quest (habit) cards — engine unchanged, framing is quests now */
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
      rewardTxt = `${icon('timer')} real timer &nbsp; ${icon('mana')} ~${Math.round((def.manaPerMin || 1) * 15)} / 15min` +
        (def.boost ? ` &nbsp; ${icon('bolt')} x3 idle boost` : '');
    } else {
      rewardTxt = `${icon('mana')} +${def.mana} &nbsp; ${icon('star')} +${def.xp} XP` +
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
      del.onclick = () => { if (confirm('Remove this quest?')) Habits.removeCustom(def.id); };
      card.appendChild(del);
    }
    return card;
  }

  function showTimerStart(def) {
    const box = el('div', 'timer-wrap');
    box.innerHTML = `<h3>${icon(def.icon)} ${def.name}</h3>
      <p class="subtle">Pick a duration — the timer runs in real time.<br>${def.boost ? 'Completing it grants <b style="color:var(--gold)">x3 idle rewards</b> for twice the duration!' : 'Minutes become mana & essence, and water the farm.'}</p>
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
    box.innerHTML = `<h3>${icon('plus')} Create a Quest</h3>
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
    const ok = el('button', 'pixbtn good', '<b>Add quest</b>');
    ok.onclick = () => {
      const name = box.querySelector('#cr-name').value.trim();
      if (!name) { toast('Give it a name!'); return; }
      Habits.addCustom(name, sel);
      closeAllModals();
      toast('Quest added', 'good');
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box);
  }

  /* ================= login modal on new day ================= */
  function maybeShowLogin() {
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

  /* ================= settings / onboarding / welcome ================= */
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
    const reset = el('button', 'pixbtn ghost sm', 'Reset all progress');
    reset.onclick = () => { if (confirm('Really erase your entire journey? This cannot be undone.')) hardReset(); };
    row.appendChild(reset);
    const about = el('p', 'subtle');
    about.style.textAlign = 'center';
    about.style.marginTop = '10px';
    about.innerHTML = 'Ritual Beasts — your real-life habits power an idle world.<br>Be kind to yourself. Missing a day is part of the journey.';
    box.appendChild(about);
    openModal(box);
  }

  function showOnboarding() {
    const box = el('div', 'onboard');
    box.innerHTML = `
      <h2>Ritual Beasts</h2>
      <p>A world of beasts, powered by <b>your real life</b>.<br>
      Drink water, cook, move, create — every real quest<br>becomes mana, seeds and evolution essence.</p>
      <p style="margin-top:10px"><b>What do you want to grow?</b> <span class="subtle">(pick 1–2)</span></p>
      <div class="goal-grid"></div>
      <div class="mrow"></div>`;
    const grid = box.querySelector('.goal-grid');
    const chosen = new Set();
    for (const [key, g] of Object.entries(GOALS)) {
      const c = el('div', 'goalcard');
      c.innerHTML = `${icon(g.icon, 'big')}<div class="gname">${g.name}</div><div class="gdesc">${g.desc}</div>`;
      c.onclick = () => {
        if (chosen.has(key)) { chosen.delete(key); c.classList.remove('on'); }
        else if (chosen.size < 2) { chosen.add(key); c.classList.add('on'); }
        next.disabled = chosen.size === 0;
        Sound.click();
      };
      grid.appendChild(c);
    }
    const next = el('button', 'pixbtn primary', '<b>Choose my companion</b>');
    next.disabled = true;
    next.onclick = () => {
      S.goals = [...chosen];
      closeModal(back);
      showStarterPick();
    };
    box.querySelector('.mrow').appendChild(next);
    const back = openModal(box, { noClose: true });
  }

  function showStarterPick() {
    const goal = S.goals[0] || 'mind';
    const options = STARTERS[goal];
    const box = el('div', 'onboard');
    box.innerHTML = `
      <h2>Choose your starter</h2>
      <p>Matched to your <b>${GOALS[goal].name}</b> path.<br>It will grow and evolve as <b>you</b> do.</p>
      <div class="starter-row"></div>
      <div class="mrow"></div>`;
    const row = box.querySelector('.starter-row');
    let sel = null;
    for (const cid of options) {
      const c = C_BY_ID[cid];
      const card = el('div', 'startercard');
      const evo = c.line ? LINES[c.line].length : 1;
      card.innerHTML = `<img src="${sprite(cid)}"><div class="sname">${c.name}</div>
        <div>${typeBadges(c.types)}</div>
        <div class="subtle" style="margin-top:4px">${evo}-stage line</div>`;
      fitSprite(card.querySelector('img'), cid, 92);
      card.onclick = () => {
        sel = cid;
        $$('.startercard', row).forEach(x => x.classList.remove('on'));
        card.classList.add('on');
        go.disabled = false;
        Sound.click();
      };
      row.appendChild(card);
    }
    const go = el('button', 'pixbtn good', '<b>Begin the journey!</b>');
    go.disabled = true;
    go.onclick = () => {
      S.starterCid = sel;
      ownBeast(sel);
      S.beasts[sel].level = 3;
      S.onboarded = true;
      Quests.generateToday();
      save();
      closeModal(back);
      confetti(50);
      Sound.levelup();
      toast(`${C_BY_ID[sel].name} joins you! Your journey begins.`, 'gold');
      renderAll();
      setTimeout(maybeShowLogin, 900);
      setTimeout(() => toast('Log a real meal at the Farm to earn seeds', 'mana'), 3200);
    };
    box.querySelector('.mrow').appendChild(go);
    const back = openModal(box, { noClose: true });
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
    renderHud();
    renderScene();
    renderBattleStats();
    renderQuestLog();
    renderUpgrades();
    renderMerge();
    if (activeTab === 'beasts') renderBeasts();
    if (activeTab === 'summon') renderSummon();
    if (activeTab === 'farm') renderFarm();
    if (activeTab === 'quests') renderQuests();
  }

  return {
    switchTab, currentTab, renderAll, renderHud, renderScene, renderSceneBg,
    renderEnemies, renderEnemyHp, renderBossTimer, renderPartyHp, renderParty,
    renderBattleStats, renderBoost, showHit, showKillRewards, attackTween,
    enemyLunge, startAdvance, renderUltMeter, showUltimateCast, skillFlash,
    showDefeat, hideDefeat, showEncounter, renderQuestLog, renderUpgrades,
    renderMerge, mergeSpawnFx, mergeFuseFx, showMap,
    renderBeasts, renderCollection, showCreature, showFeedPicker,
    renderFarm, showMealModal, showKcalTargetModal, renderFood,
    renderSummon, playWish, showSummonReveal, showRelicReveal, runLab,
    renderQuests, renderRituals, markQuestDot, maybeShowLogin,
    showTimerModal, updateTimerModal, showAddCustomModal,
    showSettings, showOnboarding, showWelcomeBack,
  };
})();
