/* ============ Ritual Beasts — UI rendering & modals ============ */
'use strict';

const UI = (() => {
  let activeTab = 'battle';
  let dexFilter = 'all';

  function sprite(cid) { return assetUrl('assets/creatures/' + C_BY_ID[cid].file); }

  /* ================= HUD ================= */
  function renderHud() {
    $('#hud-lvl-num').textContent = S.player.level;
    $('#hud-xp-fill').style.width = (100 * S.player.xp / xpForLevel(S.player.level)) + '%';
    $('#hud-gold').textContent = fmt(S.player.gold);
    $('#hud-gems').textContent = fmt(S.player.gems);
    $('#hud-mana').textContent = fmt(S.player.mana);
    $('#hud-mana-fill').style.width = (100 * S.player.mana / manaMax()) + '%';
    $('#hud-ess').textContent = fmt(S.player.essence);
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
    if (name === 'rituals') { renderRituals(); renderFood(); }
    if (name === 'quests') { renderQuests(); markQuestDot(false); }
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
    // wave pips
    const pips = $('#wave-pips');
    pips.innerHTML = '';
    for (let i = 1; i <= WAVES_PER_STAGE; i++) {
      const p = el('i', (i < S.stage.wave ? 'done ' : '') + (i === WAVES_PER_STAGE ? 'boss' : ''));
      pips.appendChild(p);
    }
    $('#btn-boss').classList.toggle('hidden', !S.stage.farm);
    renderParty();
    renderPartyHp(Battle.partyHp);
    renderBoost();
  }

  function renderEnemy(enemy) {
    const img = $('#enemy-img');
    img.src = sprite(enemy.cid);
    img.className = enemy.boss ? 'boss' : '';
    // small sprites get scaled up to a readable size
    img.style.width = '';
    img.onload = () => {
      const target = enemy.boss ? 210 : 150;
      const nat = Math.max(img.naturalWidth, img.naturalHeight);
      if (nat < target * 0.66) {
        img.style.width = Math.round(img.naturalWidth * clamp(target * 0.75 / nat, 1, 3.2)) + 'px';
      }
    };
    const nameEl = $('#enemy-name');
    nameEl.innerHTML = (enemy.boss ? icon('skull') + ' ' : '') + enemy.name;
    nameEl.className = enemy.boss ? 'boss-name' : '';
    let bt = $('#boss-timer');
    if (enemy.boss) {
      if (!bt) {
        bt = el('div'); bt.id = 'boss-timer';
        $('#enemy-holder').appendChild(bt);
      }
      bt.textContent = '30';
    } else if (bt) bt.remove();
    renderEnemyHp(enemy);
  }
  function renderEnemyHp(enemy) {
    $('#enemy-plate .pixbar > i').style.width = Math.max(0, 100 * enemy.hp / enemy.hpMax) + '%';
    $('#enemy-hp-txt').textContent = fmt(Math.max(0, enemy.hp)) + ' / ' + fmt(enemy.hpMax);
  }
  function renderBossTimer(t) {
    const bt = $('#boss-timer');
    if (bt) bt.textContent = Math.max(0, Math.ceil(t));
  }
  function renderPartyHp(frac) {
    const pct = clamp(frac * 100, 0, 100);
    const col = frac < 0.35 ? 'var(--hp)' : frac < 0.6 ? 'var(--xp)' : 'var(--good)';
    $$('#party-holder .fhp > i').forEach(i => {
      i.style.width = pct + '%';
      i.style.background = col;
    });
  }

  function renderParty() {
    const holder = $('#party-holder');
    holder.innerHTML = '';
    for (const cid of S.party) {
      const st = beastStats(cid);
      const f = el('div', 'fighter');
      f.innerHTML = `<img src="${sprite(cid)}" alt="${C_BY_ID[cid].name}">` +
        `<span class="flvl">Lv.${st.lvl}</span><span class="fhp"><i></i></span>`;
      holder.appendChild(f);
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
    const g = globalStage();
    $('#stat-gpk').textContent = fmt(5 * Math.pow(1.24, g - 1) * rewardMult());
    $('#stat-kills').textContent = fmt(S.kills);
  }

  function enemyPoint() {
    const scene = $('#scene'), eh = $('#enemy-holder');
    if (!scene || !eh) return null;
    const r = eh.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height * 0.62 };
  }

  let lungeIdx = 0;
  function showHit(dmg, crit, vfx, label) {
    const p = enemyPoint();
    if (!p) return;
    floatText(fmt(dmg), p.x, p.y - 30, crit ? 'crit' : '');
    const img = $('#enemy-img');
    img.classList.remove('hit'); void img.offsetWidth; img.classList.add('hit');
    if (vfx) VFX.cast(vfx, p.x, p.y, crit ? 1.5 : 1);
    else VFX.hit(p.x, p.y, 'metal', crit);
    if (label) skillFlash(label, false);
    if (!label) {
      const fighters = $$('#party-holder .fighter');
      if (fighters.length) {
        const f = fighters[lungeIdx++ % fighters.length];
        f.classList.remove('lunge'); void f.offsetWidth; f.classList.add('lunge');
      }
    }
  }

  function lunge(cid) {
    const i = S.party.indexOf(cid);
    const f = $$('#party-holder .fighter')[i < 0 ? 0 : i];
    if (f) { f.classList.remove('lunge'); void f.offsetWidth; f.classList.add('lunge'); }
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

  function renderUltMeter(pct, cid) {
    const fill = $('#ult-fill');
    if (!fill) return;
    fill.style.width = clamp(pct, 0, 100) + '%';
    $('#ult-pct').textContent = Math.floor(pct) + '%';
    $('#ult-wrap').classList.toggle('ready', pct >= 100);
  }

  function showUltimateCast(cid, ult) {
    const p = enemyPoint();
    skillFlash(ult.name, true);
    lunge(cid);
    if (p) VFX.ultimate(p.x, p.y, ult.vfx);
  }
  function showKillRewards(gold, mult) {
    const scene = $('#scene');
    const eh = $('#enemy-holder');
    const r = eh.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    floatText(`+${fmt(gold)} GOLD${mult > 1 ? ' x' + mult : ''}`, r.left - sr.left + r.width / 2, r.top - sr.top + 90, 'reward');
    const img = $('#enemy-img');
    img.classList.add('dying');
    Sound.coin();
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
        d.onclick = () => { switchTabToCollection(); };
      } else {
        const need = i === 1 ? 3 : i === 2 ? 6 : 12;
        d = el('div', 'pslot locked', `${icon('lock', 'big')}<span class="pname">Lv.${need}</span>`);
      }
      slots.appendChild(d);
    }
    renderDexFilters();
    renderCollection();
  }
  function switchTabToCollection() {
    toast('Pick a beast from your collection below');
  }

  function renderDexFilters() {
    const wrap = $('#dex-filters');
    wrap.innerHTML = '';
    const opts = ['all', 'owned', ...Object.keys(TYPE_COLORS)];
    for (const o of opts) {
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
    // owned first, then seen, then unseen; rarity desc inside groups
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
      d.innerHTML = `${inParty}<img loading="lazy" src="${assetUrl(`assets/creatures/${c.file}`)}" alt="">
        <span class="dname">${owned || seen ? c.name : '???'}</span>${lvl}`;
      if (owned || seen) d.onclick = () => showCreature(c.id);
      frag.appendChild(d);
    }
    grid.appendChild(frag);
  }

  /* ================= creature detail modal ================= */
  function showCreature(cid) {
    const c = C_BY_ID[cid];
    const owned = !!S.beasts[cid];
    const kit = Lore.kit(cid);
    const st = owned ? beastStats(cid) : null;
    const lvl = owned ? S.beasts[cid].level : 0;
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

    const skillHtml = kit.skills.map((sk, i) => `
      <div class="skillrow">
        <div class="sicon" style="background:${TYPE_COLORS[sk.type] || '#666'}">${icon(TYPE_ICONS[sk.type] || 'sword')}</div>
        <div>
          <div class="sname">${sk.name}</div>
          <div class="sdesc">${sk.desc}</div>
          <div class="smeta">${Math.round(sk.power * 100)}% power &nbsp; ${sk.cd}s cooldown &nbsp; ${sk.type}</div>
        </div>
      </div>`).join('');

    const u = kit.ult;
    const ultHtml = `
      <div class="skillrow ultrow">
        <div class="sicon" style="background:${TYPE_COLORS[u.type] || '#666'}">${icon(TYPE_ICONS[u.type] || 'star')}</div>
        <div>
          <div class="sname">${u.name}</div>
          <div class="sdesc">${u.desc}</div>
          <div class="smeta">${Math.round(u.power * 100)}% power &nbsp; fires at 100% charge</div>
        </div>
      </div>`;

    const passHtml = kit.passives.map(p => {
      const on = lvl >= p.level;
      return `<div class="passrow ${on ? '' : 'locked'}">
          ${icon(on ? p.icon : 'lock')}
          <div><div class="pname">${p.name}</div><div class="pdesc">${p.desc}</div></div>
          <span class="plock">${on ? 'ACTIVE' : 'Lv.' + p.level}</span>
        </div>`;
    }).join('');

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
      </div>` : '<p class="subtle" style="margin-top:6px">Not yet bonded — summon or evolve to recruit.</p>'}
      <div class="sectitle">${icon('sword')} Skills</div>${skillHtml}
      <div class="sectitle">${icon('star')} Ultimate</div>${ultHtml}
      <div class="sectitle">${icon('shield')} Passives</div>${passHtml}
      ${evoHtml ? `<div class="sectitle">${icon('paw')} Evolution line</div>${evoHtml}` : ''}
      <div class="mrow" id="cd-actions"></div>`;

    const back = openModal(box);
    const actions = box.querySelector('#cd-actions');
    if (!owned) return;

    const cost = levelUpCost(cid);
    const lu = el('button', 'pixbtn gold sm');
    lu.innerHTML = `<b>Level Up</b><span>${icon('gold')} ${fmt(cost)}</span>`;
    lu.disabled = S.player.gold < cost;
    lu.onclick = () => {
      if (S.player.gold < levelUpCost(cid)) return;
      S.player.gold -= levelUpCost(cid);
      const before = S.beasts[cid].level;
      S.beasts[cid].level++;
      Quests.progress('levelup_beast', 1);
      Sound.coin();
      const unlocked = kit.passives.find(p => p.level > before && p.level <= S.beasts[cid].level);
      if (unlocked) {
        Sound.levelup();
        confetti(26);
        toast(`${c.name} unlocked ${unlocked.name}! ${unlocked.desc}`, 'good');
      }
      save(); renderHud(); renderParty();
      closeModal(back); showCreature(cid);
    };
    actions.appendChild(lu);

    const req = evolveReq(cid);
    if (req) {
      const ev = el('button', 'pixbtn sm');
      ev.innerHTML = `<b>Evolve</b><span>Lv.${req.lvlReq} + ${req.essReq} ${icon('essence')}</span>`;
      ev.disabled = !(S.beasts[cid].level >= req.lvlReq && S.player.essence >= req.essReq);
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

  /* ================= evolution ================= */
  function doEvolve(cid) {
    const req = evolveReq(cid);
    if (!req) return;
    const inst = S.beasts[cid];
    if (inst.level < req.lvlReq || S.player.essence < req.essReq) return;
    S.player.essence -= req.essReq;
    const to = req.to;
    const oldLevel = inst.level;
    delete S.beasts[cid];
    S.beasts[to] = { level: oldLevel, xp: 0 };
    S.dex[to] = 'owned';
    S.party = S.party.map(x => x === cid ? to : x);
    Sound.evolve();

    // reveal animation
    const c = C_BY_ID[to];
    const box = el('div', 'sreveal');
    box.innerHTML = `
      <div class="snew">EVOLUTION</div>
      <div class="burst"><div class="rays"></div><img src="${assetUrl(`assets/creatures/${c.file}`)}" style="filter:brightness(0)"></div>
      <h2>${C_BY_ID[cid].name} &gt; ???</h2>
      <div>${typeBadges(c.types)}</div>`;
    const back = openModal(box, { noClose: true });
    const img = box.querySelector('img');
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

  /* ================= summon tab ================= */
  function renderSummon() {
    $('#cost-mana').textContent = Summon.MANA_COST;
    $('#cost-gem').textContent = Summon.GEM_COST;
    $('#btn-summon-mana').disabled = S.player.mana < Summon.MANA_COST;
    $('#btn-summon-gem').disabled = S.player.gems < Summon.GEM_COST;
    const left = Summon.PITY_EVERY - (S.summons.sinceRare % Summon.PITY_EVERY);
    $('#pity-note').textContent = `Guaranteed rare+ within ${left} wild summon${left > 1 ? 's' : ''} · ${S.summons.total} summons performed`;
    // relics
    const shelf = $('#relic-shelf');
    shelf.innerHTML = '';
    for (const r of RELICS) {
      const n = S.relics[r.id] || 0;
      const d = el('div', 'relic' + (n ? ' owned' : '') + (n > 1 ? ' stacked' : ''));
      if (n > 1) d.dataset.n = ' x' + n;
      d.innerHTML = `${icon(n ? r.icon : 'lock', 'big')}<span class="rname">${n ? r.name : '???'}</span>` +
        `<span class="rbonus">${n ? r.desc + (n > 1 ? ` x${n}` : '') : 'undiscovered'}</span>`;
      shelf.appendChild(d);
    }
  }

  function showSummonReveal(c, isNew, dupBonus) {
    const box = el('div', 'sreveal');
    box.innerHTML = `
      ${isNew ? '<div class="snew">NEW COMPANION</div>' : ''}
      <div class="burst"><div class="rays"></div><img src="${assetUrl(`assets/creatures/${c.file}`)}"></div>
      <div class="crarity ${c.rarity}">${c.rarity}</div>
      <h2>${c.name}</h2>
      <div>${typeBadges(c.types)}</div>
      ${dupBonus ? `<p class="subtle" style="margin-top:6px">Already bonded — gained +${dupBonus.ess}✨ and grew to Lv.${dupBonus.level}!</p>` : ''}
      ${isNew && S.party.includes(c.id) ? '<p class="subtle" style="margin-top:6px">Joined your party!</p>' : ''}`;
    const back = openModal(box);
    const again = el('button', 'pixbtn primary sm');
    again.innerHTML = `<b>Summon again</b><span>${icon('mana')} ${Summon.MANA_COST}</span>`;
    again.disabled = S.player.mana < Summon.MANA_COST;
    again.onclick = () => { closeModal(back); Summon.doSummon(false); };
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

  /* ================= rituals tab ================= */
  function renderRituals() {
    const wrap = $('#ritual-list');
    wrap.innerHTML = '';
    for (const def of Habits.DEFS) {
      wrap.appendChild(ritualCard(def, false));
    }
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
      btn.onclick = e => showMealModal(true);
    } else {
      btn = el('button', 'rbtn pixbtn good tiny', complete ? 'Done' : max > 1 ? `+1 (${done}/${max})` : 'Done!');
      btn.disabled = complete;
      btn.onclick = e => Habits.completeInstant(def, e.currentTarget);
    }
    card.appendChild(btn);
    if (isCustom) {
      const del = el('button', 'mclose', '\u2715');
      del.style.position = 'static';
      del.title = 'Remove ritual';
      del.onclick = () => { if (confirm('Remove this ritual?')) Habits.removeCustom(def.id); };
      card.appendChild(del);
    }
    return card;
  }

  /* ---- timers ---- */
  function showTimerStart(def) {
    const box = el('div', 'timer-wrap');
    box.innerHTML = `<h3>${icon(def.icon)} ${def.name}</h3>
      <p class="subtle">Pick a duration — the timer runs in real time.<br>${def.boost ? 'Completing it grants <b style="color:var(--gold)">x3 idle rewards</b> for twice the duration!' : 'Completing it converts minutes into mana & essence.'}</p>
      <div class="preset-row"></div>
      <div class="mrow"></div>`;
    const row = box.querySelector('.preset-row');
    let sel = def.mins[1] || def.mins[0];
    for (const m of def.mins) {
      const p = el('button', 'preset' + (m === sel ? ' on' : ''), m + 'm');
      p.onclick = () => { sel = m; $$('.preset', row).forEach(x => x.classList.remove('on')); p.classList.add('on'); };
      row.appendChild(p);
    }
    const start = el('button', 'pixbtn gem', '<b>Begin ritual</b>');
    start.onclick = () => {
      if (Habits.startTimer(def.id, sel)) {
        closeAllModals();
        showTimerModal();
        renderRituals();
      }
    };
    box.querySelector('.mrow').appendChild(start);
    openModal(box);
  }

  function showTimerModal() {
    if (!S.exTimer) return;
    const def = Habits.defById(S.exTimer.hid);
    const total = S.exTimer.mins * 60;
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
    give.style.margin = '0';
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

  /* ---- meals ---- */
  function showMealModal(healthyDefault) {
    const box = el('div');
    box.innerHTML = `<h3>${icon('meal')} Log Food</h3>
      <label>What did you eat?</label>
      <input type="text" id="meal-name" maxlength="40" placeholder="e.g. Chicken salad">
      <label>Calories (optional)</label>
      <input type="number" id="meal-kcal" min="0" max="5000" placeholder="e.g. 450">
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--txt)">
        <input type="checkbox" id="meal-healthy" ${healthyDefault ? 'checked' : ''} style="width:18px;height:18px"> This was a healthy choice
      </label>
      <div class="mrow"></div>`;
    const row = box.querySelector('.mrow');
    const ok = el('button', 'pixbtn good', '<b>Log it</b>');
    ok.onclick = e => {
      const name = box.querySelector('#meal-name').value.trim();
      const kcal = parseInt(box.querySelector('#meal-kcal').value, 10) || 0;
      const healthy = box.querySelector('#meal-healthy').checked;
      closeAllModals();
      Habits.logMeal(name, kcal, healthy, $('#btn-log-meal'));
    };
    row.appendChild(ok);
    openModal(box);
    setTimeout(() => box.querySelector('#meal-name').focus(), 60);
  }

  function renderFood() {
    Habits.resetMealsIfNewDay();
    const now = Habits.kcalToday();
    $('#kcal-now').textContent = now;
    $('#kcal-goal').textContent = '/ ' + S.kcalTarget + ' kcal';
    const frac = clamp(now / S.kcalTarget, 0, 1);
    const arc = $('#kcal-arc');
    arc.style.strokeDashoffset = 213.6 * (1 - frac);
    arc.style.stroke = now > S.kcalTarget ? 'var(--hp)' : 'var(--good)';
    const list = $('#meal-list');
    list.innerHTML = '';
    for (const m of S.meals.slice().reverse()) {
      list.appendChild(el('div', 'meal-row',
        `<b>${m.name}</b><span>${m.kcal ? m.kcal + ' kcal' : '—'}</span>`));
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

  function showAddCustomModal() {
    const box = el('div');
    const icons = ['star', 'book', 'scroll', 'water', 'sunrise', 'palette', 'crown', 'paw', 'relic', 'check'];
    box.innerHTML = `<h3>${icon('plus')} Create a Ritual</h3>
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
    const ok = el('button', 'pixbtn good', '<b>Add ritual</b>');
    ok.onclick = () => {
      const name = box.querySelector('#cr-name').value.trim();
      if (!name) { toast('Give it a name!'); return; }
      Habits.addCustom(name, sel);
      closeAllModals();
      toast('Ritual added 🌱', 'good');
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box);
  }

  /* ================= quests tab ================= */
  function renderQuests() {
    Quests.generateToday();
    $('#quest-day').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const wrap = $('#quest-list');
    wrap.innerHTML = '';
    for (const q of S.quests.list) {
      const done = q.progress >= q.target;
      const card = el('div', 'quest' + (done ? ' done' : ''));
      const rewardBits = [];
      if (q.reward.gems) rewardBits.push(icon('gem') + q.reward.gems);
      if (q.reward.mana) rewardBits.push(icon('mana') + q.reward.mana);
      if (q.reward.ess) rewardBits.push(icon('essence') + q.reward.ess);
      if (q.reward.gold) rewardBits.push(icon('gold'));
      card.innerHTML = `
        <div class="qic">${icon(q.icon)}</div>
        <div class="qmain">
          <div class="qname">${q.name}</div>
          <span class="pixbar good"><i style="width:${100 * q.progress / q.target}%"></i></span>
          <div class="qprog-txt">${q.progress}/${q.target} ${rewardBits.join(' ')}</div>
        </div>`;
      const btn = el('button', 'qclaim pixbtn gold tiny', q.claimed ? 'Claimed' : 'Claim');
      btn.disabled = !done || q.claimed;
      btn.onclick = e => Quests.claim(q.qid, e.currentTarget);
      card.appendChild(btn);
      wrap.appendChild(card);
    }
    // journey stats
    const j = $('#journey-panel');
    j.innerHTML = '';
    const stats = [
      ['streak', 'Current streak', S.streak.count + ' day' + (S.streak.count === 1 ? '' : 's')],
      ['sword', 'Beasts defeated', fmt(S.kills)],
      ['skull', 'Bosses slain', fmt(S.bossKills)],
      ['paw', 'Companions bonded', Object.keys(S.beasts).length],
      ['mana', 'Summons performed', S.summons.total],
      ['book', 'Journey started', new Date(S.created).toLocaleDateString()],
    ];
    for (const [ic, k, v] of stats) {
      j.appendChild(el('div', 'jstat', `<span>${icon(ic)}${k}</span><b>${v}</b>`));
    }
  }

  /* ================= settings ================= */
  function showSettings() {
    const box = el('div');
    box.innerHTML = `<h3>Settings</h3><div class="mrow" style="flex-direction:column;align-items:stretch"></div>`;
    const row = box.querySelector('.mrow');
    const snd = el('button', 'pixbtn ghost sm', (S.settings.sound ? 'Sound: ON' : 'Sound: OFF'));
    snd.style.margin = '0';
    snd.onclick = () => {
      S.settings.sound = !S.settings.sound;
      Sound.setEnabled(S.settings.sound);
      snd.textContent = S.settings.sound ? 'Sound: ON' : 'Sound: OFF';
      save();
    };
    row.appendChild(snd);
    const reset = el('button', 'pixbtn ghost sm', 'Reset all progress');
    reset.style.margin = '0';
    reset.onclick = () => { if (confirm('Really erase your entire journey? This cannot be undone.')) hardReset(); };
    row.appendChild(reset);
    const about = el('p', 'subtle');
    about.style.textAlign = 'center';
    about.style.marginTop = '10px';
    about.innerHTML = 'Ritual Beasts — your real-life habits power an idle world.<br>Be kind to yourself. Missing a day is part of the journey.';
    box.appendChild(about);
    openModal(box);
  }

  /* ================= onboarding ================= */
  function showOnboarding() {
    const box = el('div', 'onboard');
    box.innerHTML = `
      <h2>Ritual Beasts</h2>
      <p>A world of beasts, powered by <b>your real life</b>.<br>
      Drink water, cook, move, create — every real ritual<br>becomes mana, XP and evolution essence.</p>
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
      card.innerHTML = `<img src="${assetUrl(`assets/creatures/${c.file}`)}"><div class="sname">${c.name}</div>
        <div>${typeBadges(c.types)}</div>
        <div class="subtle" style="margin-top:4px">${evo}-stage evolution line</div>`;
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
      setTimeout(() => {
        toast('Tip: the Rituals tab turns real life into mana', 'mana');
      }, 2600);
    };
    box.querySelector('.mrow').appendChild(go);
    const back = openModal(box, { noClose: true });
  }

  /* ================= welcome back ================= */
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
    };
    box.querySelector('.mrow').appendChild(ok);
    openModal(box, { noClose: true });
  }

  /* ================= global ================= */
  function renderAll() {
    renderHud();
    renderScene();
    renderBattleStats();
    if (activeTab === 'beasts') renderBeasts();
    if (activeTab === 'summon') renderSummon();
    if (activeTab === 'rituals') { renderRituals(); renderFood(); }
    if (activeTab === 'quests') renderQuests();
  }

  return {
    switchTab, currentTab, renderAll, renderHud, renderScene, renderSceneBg,
    renderEnemy, renderEnemyHp, renderBossTimer, renderPartyHp, renderParty,
    renderBattleStats, renderBoost, showHit, showKillRewards,
    lunge, renderUltMeter, showUltimateCast, skillFlash,
    renderBeasts, renderCollection, showCreature,
    renderSummon, showSummonReveal, showRelicReveal,
    renderRituals, renderFood, showMealModal, showKcalTargetModal, showAddCustomModal,
    showTimerModal, updateTimerModal,
    renderQuests, markQuestDot,
    showSettings, showOnboarding, showWelcomeBack,
  };
})();
