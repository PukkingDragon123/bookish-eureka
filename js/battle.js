/* ============ Ritual Beasts — battle engine v3 ============
   Packs of 1-3 enemies walk in from the right; the party advances between
   waves; skills and ultimates land as travelling attack tweens with typed
   pixel VFX. Boss waves are timed. Wipes show a defeat screen with a way
   forward instead of silently resetting.                                     */
'use strict';

const Battle = (() => {
  const TICK_MS = 300;
  let enemies = [];            // [{cid,name,hp,hpMax,boss,defType,gold,xp,slot,dying}]
  let partyHp = 1;
  let resting = 0;
  let advancing = 0;           // ticks of walk-between-waves
  let bossTimeLeft = 0;
  let ultCharge = 0;
  const cds = {};
  let sinceEncounter = 0;

  /* ----- pack generation ----- */
  function enemyPoolForArea(areaIdx) {
    const affinity = [
      ['Nature', 'Earth', 'Mystic'],
      ['Fire', 'Electric', 'Earth'],
      ['Water', 'Shadow', 'Metal'],
      ['Ice', 'Water', 'Shadow'],
    ][areaIdx % AREAS.length];
    const pool = window.CREATURES.filter(c => c.types.some(t => affinity.includes(t)));
    return pool.length >= 12 ? pool : window.CREATURES;
  }

  function spawnWave() {
    const g = globalStage();
    const isBoss = S.stage.wave === WAVES_PER_STAGE && !S.stage.farm;
    const pool = enemyPoolForArea(S.stage.area);
    enemies = [];
    const packSize = isBoss ? 1 : (S.stage.wave < 3 ? 1 : irnd(1, Math.min(3, 1 + Math.floor(S.stage.wave / 3))));
    for (let i = 0; i < packSize; i++) {
      let c;
      if (isBoss) {
        const bp = pool.filter(x => x.stage >= 2 || ['rare', 'epic', 'legendary'].includes(x.rarity));
        c = pick(bp.length ? bp : pool);
      } else c = pick(pool);
      seeCreature(c.id);
      const hpBase = 26 * Math.pow(1.31, g - 1) * (1 + 0.10 * (S.stage.wave - 1));
      const hp = Math.floor(hpBase * (isBoss ? 7 : 1) / (packSize === 1 ? 1 : 1.6));
      enemies.push({
        cid: c.id,
        name: isBoss ? c.name + ' the ' + pick(['Dread', 'Mighty', 'Ancient', 'Colossal', 'Feral']) : c.name,
        hp, hpMax: hp, boss: isBoss, defType: c.types[0],
        gold: Math.floor(5 * Math.pow(1.24, g - 1) * (isBoss ? 16 : 1) / (packSize === 1 ? 1 : 1.5)),
        xp: Math.floor((2 + g * 0.55) * (isBoss ? 10 : 1) / (packSize === 1 ? 1 : 1.5)),
        slot: i, dying: false,
      });
    }
    if (isBoss) { bossTimeLeft = 30; Sound.boss(); }
    UI.renderEnemies(enemies, true);
  }

  const alive = () => enemies.filter(e => !e.dying && e.hp > 0);
  const front = () => alive()[0] || null;

  /* ----- damage model ----- */
  function partySynergy(types) {
    let n = 0;
    for (const cid of S.party) if (C_BY_ID[cid].types[0] === types[0]) n++;
    return n >= 2 ? 1.1 : 1;
  }
  function memberDps(cid, target) {
    const st = beastStats(cid);
    const c = C_BY_ID[cid];
    const mult = target ? typeMult(c.types, target.defType) : 1;
    return st.atk * (1 + st.spd / 40) * mult * partySynergy(c.types);
  }
  function partyDps() {
    const t = front();
    let dps = 0;
    for (const cid of S.party) dps += memberDps(cid, t);
    return dps * (1 + relicBonusStat('dmg') + upgradeBonus('dmg') + mergeBonus('dmg'))
               * (1 + relicBonusStat('spd') + Lore.passiveBonus('spd') + upgradeBonus('spd'));
  }
  function enemyDps() {
    const g = globalStage();
    const n = alive().length;
    return 3.2 * Math.pow(1.25, g - 1) * (front() && front().boss ? 1.5 : 1) * (1 + (n - 1) * 0.45);
  }
  function partyHpMax() {
    let hp = 0;
    for (const cid of S.party) hp += beastStats(cid).hp;
    return Math.max(1, hp);
  }
  function critChance() {
    return 0.06 + Lore.passiveBonus('crit') + upgradeBonus('crit');
  }

  function hitEnemy(target, amount, opts) {
    opts = opts || {};
    if (!target || target.dying) return;
    target.hp -= amount;
    const life = Lore.passiveBonus('lifest');
    if (life > 0) partyHp = Math.min(1, partyHp + (amount * life) / partyHpMax());
    if (!opts.silent) UI.showHit(target, amount, opts.crit, opts.vfx, opts.label);
    if (!opts.noCharge) {
      ultCharge = Math.min(100, ultCharge +
        (opts.charge || 2.1) * (1 + Lore.passiveBonus('ult') + upgradeBonus('ult')));
    }
    if (target.hp <= 0) killEnemy(target);
    else UI.renderEnemyHp(target);
  }

  /* ----- skills / ultimate ----- */
  function tickCooldowns(dt) {
    for (const k of Object.keys(cds)) {
      cds[k] -= dt;
      if (cds[k] <= 0) delete cds[k];
    }
  }

  function skillListFor(cid) {
    const kit = Lore.kit(cid);
    const list = kit.skills.slice();
    const inst = S.beasts[cid];
    if (inst && inst.graft && C_BY_ID[inst.graft]) {
      const g = Lore.kit(inst.graft).skills[1];
      list.push(Object.assign({}, g, { cd: g.cd * 1.4, graft: true }));
    }
    return list;
  }

  function trySkills() {
    const t = front();
    if (!t) return;
    for (const cid of S.party) {
      const skills = skillListFor(cid);
      for (let i = 0; i < skills.length; i++) {
        const sk = skills[i];
        const key = cid + '_' + i;
        if (cds[key]) continue;
        cds[key] = sk.cd;
        const crit = Math.random() < critChance();
        const dmg = memberDps(cid, t) * sk.power * (crit ? 2.2 : 1) * rnd(0.92, 1.1);
        UI.attackTween(cid, t, () => {
          hitEnemy(t, dmg, { crit, vfx: sk.vfx, label: sk.name, charge: i === 0 ? 5 : 12 });
          // heavy skills splash the back rank
          if (i >= 1) for (const o of alive()) {
            if (o !== t) hitEnemy(o, dmg * 0.4, { silent: true, noCharge: true });
          }
        });
        Sound.hit();
        return;
      }
    }
  }

  function fireUltimate() {
    const t = front();
    if (!t || ultCharge < 100 || !S.party.length) return;
    const cid = pick(S.party);
    const kit = Lore.kit(cid);
    ultCharge = 0;
    UI.showUltimateCast(cid, kit.ult);
    const targets = alive();
    for (const e of targets) {
      const dmg = memberDps(cid, e) * kit.ult.power * rnd(0.95, 1.08);
      hitEnemy(e, dmg, { crit: true, vfx: null, noCharge: true });
    }
    Sound.evolve();
  }

  /* ----- main tick ----- */
  function tick() {
    if (!S.onboarded || S.party.length === 0) return;
    const dt = TICK_MS / 1000;

    if (resting > 0) {
      resting--;
      partyHp = Math.min(1, partyHp + 0.09);
      UI.renderPartyHp(partyHp);
      if (resting === 0) spawnWave();
      return;
    }
    if (advancing > 0) {
      advancing--;
      if (advancing === 0) spawnWave();
      return;
    }
    if (!enemies.length) { spawnWave(); return; }
    if (!alive().length) return;   // deaths animating out

    tickCooldowns(dt);

    const t = front();
    const chip = partyDps() * dt * 0.55 * rnd(0.86, 1.16);
    hitEnemy(t, chip, { silent: true, charge: 1.8 });

    trySkills();
    if (ultCharge >= 100) fireUltimate();
    UI.renderUltMeter(ultCharge);

    // enemies strike back (visual lunge from a random attacker)
    const edmg = enemyDps() * dt * rnd(0.8, 1.2);
    partyHp = clamp(partyHp - edmg / partyHpMax() + 0.004, 0, 1);
    UI.renderPartyHp(partyHp);
    if (Math.random() < 0.16) UI.enemyLunge(pick(alive()));

    const f = front();
    if (f && f.boss) {
      bossTimeLeft -= dt;
      UI.renderBossTimer(bossTimeLeft);
      if (bossTimeLeft <= 0 && f.hp > 0) return bossFailed();
    }

    if (partyHp <= 0) return partyWiped();
  }

  function killEnemy(e) {
    e.dying = true;
    const mult = rewardMult();
    const gold = grantGold(e.gold * mult);
    grantBeastXp(e.xp * mult);
    grantPlayerXp(Math.max(1, Math.floor(e.xp * 0.35)) * mult);
    S.kills++;
    sinceEncounter++;
    Quests.progress('kills', 1);
    UI.showKillRewards(e, gold, mult);
    Sound.kill();

    if (!alive().length) waveCleared(e.boss);
  }

  function waveCleared(wasBoss) {
    if (wasBoss) {
      S.bossKills++;
      Quests.progress('boss', 1);
      grantGems(irnd(2, 4));
      grantEssence(irnd(2, 5));
      grantLabPoints(irnd(1, 2));
      toast('Boss defeated! Gems, essence and lab points recovered.', 'gold');
      confetti(30);
      advanceStage();
    } else if (!S.stage.farm) {
      S.stage.wave = Math.min(WAVES_PER_STAGE, S.stage.wave + 1);
    }
    // random roadside encounter minigame
    if (sinceEncounter >= irnd(8, 14) && !wasBoss) {
      sinceEncounter = 0;
      setTimeout(() => UI.showEncounter(), 700);
    }
    enemies = [];
    advancing = Math.floor(1400 / TICK_MS);   // walk to the next pack
    UI.startAdvance();
    UI.renderScene();
    save();
  }

  function partyWiped() {
    S.losses++;
    Sound.fail();
    S.stage.wave = 1;
    S.stage.farm = false;
    resting = Math.floor(5200 / TICK_MS);
    enemies = [];
    UI.showDefeat();
    UI.renderScene();
  }

  function bossFailed() {
    toast('The boss stands firm. Grow stronger and retry!');
    Sound.fail();
    S.stage.farm = true;
    S.stage.wave = WAVES_PER_STAGE - 1;
    enemies = [];
    advancing = Math.floor(900 / TICK_MS);
    UI.renderScene();
  }

  function challengeBoss() {
    if (!S.stage.farm) return;
    S.stage.farm = false;
    S.stage.wave = WAVES_PER_STAGE;
    enemies = [];
    UI.renderScene();
  }

  function advanceStage() {
    S.stage.num++;
    S.stage.wave = 1;
    S.stage.farm = false;
    if (S.stage.num > STAGES_PER_AREA) {
      S.stage.num = 1;
      S.stage.area++;
      if (S.stage.area >= AREAS.length) { S.stage.area = 0; S.stage.tier++; }
      toast(`Entering ${AREAS[S.stage.area].name}!`, 'gold');
      UI.renderSceneBg();
    }
    S.regionProgress[S.stage.area] = Math.max(S.regionProgress[S.stage.area] || 1, S.stage.num);
  }

  /* travel to an unlocked region, resuming its saved progress */
  function travel(areaIdx) {
    if (areaIdx === S.stage.area) return;
    S.regionProgress[S.stage.area] = Math.max(S.regionProgress[S.stage.area] || 1, S.stage.num);
    S.stage.area = areaIdx;
    S.stage.num = S.regionProgress[areaIdx] || 1;
    S.stage.wave = 1;
    S.stage.farm = false;
    enemies = [];
    UI.renderSceneBg();
    UI.renderScene();
    toast(`Traveling to ${AREAS[areaIdx].name}…`, 'gold');
    save();
  }
  function regionUnlocked(areaIdx) {
    if (areaIdx === 0 || S.stage.tier > 0) return true;
    if (areaIdx <= S.stage.area) return true;
    return !!S.regionProgress[areaIdx];
  }

  function currentDpsEstimate() {
    return S.party.length ? partyDps() : 0;
  }

  function offlineGains(seconds) {
    const g = globalStage();
    const dps = partyDps() || 1;
    const eHp = 26 * Math.pow(1.31, g - 1);
    const killTime = Math.max(1.2, eHp / dps + 0.5);
    const kills = Math.floor(seconds / killTime * 0.85);
    return {
      kills,
      gold: Math.floor(kills * 5 * Math.pow(1.24, g - 1)),
      xp: Math.floor(kills * (2 + g * 0.55) * 0.35),
    };
  }

  /* what the cooldown strip needs: every party member's skills and how far
     through their cooldown each one is (0 = just fired, 1 = ready to swing) */
  function cooldownState() {
    return S.party.map(cid => ({
      cid,
      skills: skillListFor(cid).map((sk, i) => {
        const left = cds[cid + '_' + i] || 0;
        return { name: sk.name, cd: sk.cd, left, frac: clamp(1 - left / sk.cd, 0, 1) };
      }),
    }));
  }

  return {
    tick, spawnWave, challengeBoss, currentDpsEstimate, offlineGains, travel,
    regionUnlocked, skillListFor, cooldownState, TICK_MS,
    get enemies() { return enemies; },
    get partyHp() { return partyHp; },
    get ultCharge() { return ultCharge; },
  };
})();
