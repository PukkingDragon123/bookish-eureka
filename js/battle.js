/* ============ Ritual Beasts — idle battle engine ============ */
'use strict';

const Battle = (() => {
  const TICK_MS = 300;
  let enemy = null;
  let partyHp = 1;
  let resting = 0;
  let bossTimeLeft = 0;
  let ultCharge = 0;          // 0..100, shared party meter
  let ultReadyCid = null;     // whose ultimate is queued
  const cds = {};             // cid_skillIdx -> seconds remaining

  /* ----- enemy generation ----- */
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

  function spawnEnemy() {
    const g = globalStage();
    const isBoss = S.stage.wave === WAVES_PER_STAGE && !S.stage.farm;
    const pool = enemyPoolForArea(S.stage.area);
    let c;
    if (isBoss) {
      const bossPool = pool.filter(x => x.stage >= 2 || ['rare', 'epic', 'legendary'].includes(x.rarity));
      c = pick(bossPool.length ? bossPool : pool);
    } else {
      c = pick(pool);
    }
    seeCreature(c.id);
    const hpBase = 26 * Math.pow(1.31, g - 1) * (1 + 0.10 * (S.stage.wave - 1));
    const hp = Math.floor(hpBase * (isBoss ? 7 : 1));
    enemy = {
      cid: c.id,
      name: (isBoss ? c.name + ' the ' + pick(['Dread', 'Mighty', 'Ancient', 'Colossal', 'Feral']) : c.name),
      hp, hpMax: hp,
      boss: isBoss,
      defType: c.types[0],
      goldReward: Math.floor(5 * Math.pow(1.24, g - 1) * (isBoss ? 16 : 1)),
      xpReward: Math.floor((2 + g * 0.55) * (isBoss ? 10 : 1)),
    };
    if (isBoss) { bossTimeLeft = 30; Sound.boss(); }
    UI.renderEnemy(enemy);
    return enemy;
  }

  /* ----- damage model ----- */
  function partySynergy(types) {
    const t = types[0];
    let n = 0;
    for (const cid of S.party) if (C_BY_ID[cid].types[0] === t) n++;
    return n >= 2 ? 1.1 : 1;
  }

  function memberDps(cid) {
    const st = beastStats(cid);
    const c = C_BY_ID[cid];
    const mult = enemy ? typeMult(c.types, enemy.defType) : 1;
    return st.atk * (1 + st.spd / 40) * mult * partySynergy(c.types);
  }

  function partyDps() {
    let dps = 0;
    for (const cid of S.party) dps += memberDps(cid);
    return dps * (1 + relicBonusStat('dmg'))
               * (1 + relicBonusStat('spd') + Lore.passiveBonus('spd'));
  }

  function enemyDps() {
    const g = globalStage();
    return 3.2 * Math.pow(1.25, g - 1) * (enemy && enemy.boss ? 1.5 : 1);
  }
  function partyHpMax() {
    let hp = 0;
    for (const cid of S.party) hp += beastStats(cid).hp;
    return Math.max(1, hp);
  }

  function dealDamage(amount, opts) {
    opts = opts || {};
    if (!enemy) return;
    enemy.hp -= amount;
    const life = Lore.passiveBonus('lifest');
    if (life > 0) partyHp = Math.min(1, partyHp + (amount * life) / partyHpMax());
    if (!opts.silent) UI.showHit(amount, opts.crit, opts.vfx, opts.label);
    if (!opts.noCharge) {
      ultCharge = Math.min(100, ultCharge + (opts.charge || 2.1) * (1 + Lore.passiveBonus('ult')));
      UI.renderUltMeter(ultCharge, ultReadyCid);
    }
  }

  /* ----- skills ----- */
  function tickCooldowns(dt) {
    for (const k of Object.keys(cds)) {
      cds[k] -= dt;
      if (cds[k] <= 0) delete cds[k];
    }
  }

  function trySkills() {
    if (!enemy) return;
    for (const cid of S.party) {
      const kit = Lore.kit(cid);
      for (let i = 0; i < kit.skills.length; i++) {
        const sk = kit.skills[i];
        const key = cid + '_' + i;
        if (cds[key]) continue;
        cds[key] = sk.cd;
        const base = memberDps(cid) * sk.power;
        const crit = Math.random() < (0.06 + Lore.passiveBonus('crit'));
        const dmg = base * (crit ? 2.2 : 1) * rnd(0.92, 1.1);
        dealDamage(dmg, { crit, vfx: sk.vfx, label: sk.name, charge: i === 0 ? 5 : 12 });
        UI.lunge(cid);
        Sound.hit();
        return;               // one skill per tick keeps the scene readable
      }
    }
  }

  function fireUltimate() {
    if (!enemy || ultCharge < 100 || !S.party.length) return;
    const cid = ultReadyCid && S.party.includes(ultReadyCid) ? ultReadyCid : S.party[0];
    const kit = Lore.kit(cid);
    const dmg = memberDps(cid) * kit.ult.power * rnd(0.95, 1.08);
    ultCharge = 0;
    UI.showUltimateCast(cid, kit.ult);
    dealDamage(dmg, { crit: true, vfx: kit.ult.vfx, noCharge: true, ult: true });
    Sound.evolve();
    UI.renderUltMeter(ultCharge, ultReadyCid);
  }

  /* ----- main tick ----- */
  function tick() {
    if (!S.onboarded || S.party.length === 0) return;
    const dt = TICK_MS / 1000;

    if (resting > 0) {
      resting--;
      partyHp = Math.min(1, partyHp + 0.09);
      UI.renderPartyHp(partyHp);
      if (resting === 0 && !enemy) spawnEnemy();
      return;
    }
    if (!enemy) { spawnEnemy(); return; }

    tickCooldowns(dt);

    // steady auto-attack chip damage
    const chip = partyDps() * dt * 0.55 * rnd(0.86, 1.16);
    dealDamage(chip, { silent: true, charge: 1.8 });

    // discrete skill casts (with vfx) and ultimates
    trySkills();
    if (ultCharge >= 100) {
      ultReadyCid = S.party[Math.floor(Math.random() * S.party.length)];
      fireUltimate();
    }

    // enemy strikes back; party regenerates a little while fighting
    const edmg = enemyDps() * dt * rnd(0.8, 1.2);
    partyHp = clamp(partyHp - edmg / partyHpMax() + 0.004, 0, 1);
    UI.renderPartyHp(partyHp);

    if (enemy.boss) {
      bossTimeLeft -= dt;
      UI.renderBossTimer(bossTimeLeft);
      if (bossTimeLeft <= 0 && enemy.hp > 0) return bossFailed();
    }
    if (enemy.hp <= 0) return killEnemy();

    if (partyHp <= 0) {
      toast('Your party retreats to rest…');
      Sound.fail();
      S.stage.wave = 1;
      S.stage.farm = false;
      resting = Math.floor(4000 / TICK_MS);
      enemy = null;
      UI.renderScene();
      return;
    }
    UI.renderEnemyHp(enemy);
  }

  function killEnemy() {
    const wasBoss = enemy.boss;
    partyHp = Math.min(1, partyHp + 0.16);
    const mult = rewardMult();
    const gold = grantGold(enemy.goldReward * mult);
    grantBeastXp(enemy.xpReward * mult);
    grantPlayerXp(Math.max(1, Math.floor(enemy.xpReward * 0.35)) * mult);
    S.kills++;
    Quests.progress('kills', 1);
    UI.showKillRewards(gold, mult);
    Sound.kill();

    if (wasBoss) {
      S.bossKills++;
      Quests.progress('boss', 1);
      grantGems(irnd(2, 4));
      grantEssence(irnd(2, 5));
      toast('Boss defeated! Gems and essence recovered.', 'gold');
      confetti(30);
      advanceStage();
    } else if (!S.stage.farm) {
      S.stage.wave = Math.min(WAVES_PER_STAGE, S.stage.wave + 1);
    }
    enemy = null;
    UI.renderScene();
    save();
  }

  function bossFailed() {
    toast('The boss stands firm. Grow stronger and retry!');
    Sound.fail();
    S.stage.farm = true;
    S.stage.wave = WAVES_PER_STAGE - 1;
    enemy = null;
    UI.renderScene();
  }

  function challengeBoss() {
    if (!S.stage.farm) return;
    S.stage.farm = false;
    S.stage.wave = WAVES_PER_STAGE;
    enemy = null;
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

  return {
    tick, spawnEnemy, challengeBoss, currentDpsEstimate, offlineGains, TICK_MS,
    get enemy() { return enemy; },
    get partyHp() { return partyHp; },
    get ultCharge() { return ultCharge; },
  };
})();
