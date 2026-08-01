/* ============ Ritual Beasts — idle battle engine ============ */
'use strict';

const Battle = (() => {
  const TICK_MS = 300;
  let enemy = null;        // {cid, name, hp, hpMax, boss, defType, goldReward, xpReward}
  let partyHp = 1;         // 0..1 shared vitality
  let resting = 0;         // ticks left of rest
  let bossTimeLeft = 0;    // seconds
  let killsThisStage = 0;
  let lastDpsWindow = [];

  /* ----- enemy generation ----- */
  function enemyPoolForArea(areaIdx) {
    // deterministic-ish flavor per area: filter by loose type affinity
    const affinity = [
      ['Nature', 'Earth', 'Mystic'],   // meadow
      ['Fire', 'Electric', 'Earth'],   // plains
      ['Water', 'Shadow', 'Metal'],    // falls
      ['Ice', 'Water', 'Shadow'],      // frost
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
      const bossPool = pool.filter(x => x.stage >= 2 || x.rarity === 'epic' || x.rarity === 'legendary' || x.rarity === 'rare');
      c = pick(bossPool.length ? bossPool : pool);
    } else {
      c = pick(pool);
    }
    seeCreature(c.id);
    const hpBase = 26 * Math.pow(1.31, g - 1) * (1 + 0.10 * (S.stage.wave - 1));
    const hp = Math.floor(hpBase * (isBoss ? 7 : 1));
    enemy = {
      cid: c.id,
      name: (isBoss ? '☠ ' : '') + c.name + (isBoss ? ' the ' + pick(['Dread', 'Mighty', 'Ancient', 'Colossal', 'Feral']) : ''),
      hp, hpMax: hp,
      boss: isBoss,
      defType: c.types[0],
      goldReward: Math.floor(5 * Math.pow(1.24, g - 1) * (isBoss ? 16 : 1)),
      xpReward: Math.floor((2 + g * 0.55) * (isBoss ? 10 : 1)),
    };
    if (isBoss) {
      bossTimeLeft = 30;
      Sound.boss();
    }
    UI.renderEnemy(enemy);
    return enemy;
  }

  /* ----- party damage ----- */
  function partyDps() {
    let dps = 0;
    for (const cid of S.party) {
      const st = beastStats(cid);
      const c = C_BY_ID[cid];
      const mult = enemy ? typeMult(c.types, enemy.defType) : 1;
      const synergy = partySynergy(c.types);
      dps += st.atk * (1 + st.spd / 40) * mult * synergy;
    }
    dps *= 1 + relicBonusStat('dmg');
    dps *= 1 + relicBonusStat('spd');
    return dps;
  }

  function partySynergy(types) {
    // +10% if 2+ party members share the primary type
    const t = types[0];
    let n = 0;
    for (const cid of S.party) if (C_BY_ID[cid].types[0] === t) n++;
    return n >= 2 ? 1.1 : 1;
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

  /* ----- main tick ----- */
  function tick() {
    if (!S.onboarded || S.party.length === 0) return;
    if (resting > 0) {
      resting--;
      partyHp = Math.min(1, partyHp + 0.09);
      UI.renderPartyHp(partyHp);
      if (resting === 0 && !enemy) spawnEnemy();
      return;
    }
    if (!enemy) { spawnEnemy(); return; }

    // party attacks
    const dmg = partyDps() * (TICK_MS / 1000) * rnd(0.86, 1.16);
    const crit = Math.random() < 0.08;
    const total = dmg * (crit ? 2.2 : 1);
    enemy.hp -= total;
    lastDpsWindow.push({ t: Date.now(), d: total });
    if (lastDpsWindow.length > 24) lastDpsWindow.shift();
    UI.showHit(total, crit);

    // enemy attacks back (party slowly regenerates while fighting)
    const edmg = enemyDps() * (TICK_MS / 1000) * rnd(0.8, 1.2);
    partyHp = clamp(partyHp - edmg / partyHpMax() + 0.004, 0, 1);
    UI.renderPartyHp(partyHp);

    if (enemy.boss) {
      bossTimeLeft -= TICK_MS / 1000;
      UI.renderBossTimer(bossTimeLeft);
      if (bossTimeLeft <= 0 && enemy.hp > 0) return bossFailed();
    }

    if (enemy.hp <= 0) return killEnemy();

    if (partyHp <= 0) {
      // party wipes: rest, drop back to wave 1 of the stage
      toast('Your party retreats to rest…');
      Sound.fail();
      S.stage.wave = 1;
      S.stage.farm = false;
      killsThisStage = 0;
      resting = Math.floor(4000 / TICK_MS);
      enemy = null;
      UI.renderScene();
      return;
    }
    UI.renderEnemyHp(enemy);
  }

  function killEnemy() {
    const wasBoss = enemy.boss;
    partyHp = Math.min(1, partyHp + 0.16);  // victory rush heal
    const mult = rewardMult();
    const gold = grantGold(enemy.goldReward * mult);
    const bxp = enemy.xpReward * mult;
    grantBeastXp(bxp);
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
      toast(`Boss defeated! 💎 +gems ✨ +essence`, 'gold');
      confetti(30);
      advanceStage();
    } else {
      if (!S.stage.farm) {
        S.stage.wave++;
        if (S.stage.wave > WAVES_PER_STAGE) S.stage.wave = WAVES_PER_STAGE;
      }
    }
    enemy = null;
    UI.renderScene();
    save();
  }

  function bossFailed() {
    toast('The boss stands firm. Grow stronger and retry!');
    Sound.fail();
    S.stage.farm = true;   // farm mode: fight wave-9 enemies, boss via button
    S.stage.wave = WAVES_PER_STAGE - 1;
    enemy = null;
    UI.renderScene();
  }

  function challengeBoss() {
    if (S.stage.farm) {
      S.stage.farm = false;
      S.stage.wave = WAVES_PER_STAGE;
      enemy = null;
      UI.renderScene();
    }
  }

  function advanceStage() {
    S.stage.num++;
    S.stage.wave = 1;
    S.stage.farm = false;
    killsThisStage = 0;
    if (S.stage.num > STAGES_PER_AREA) {
      S.stage.num = 1;
      S.stage.area++;
      if (S.stage.area >= AREAS.length) {
        S.stage.area = 0;
        S.stage.tier++;
      }
      toast(`Entering ${AREAS[S.stage.area].name}!`, 'gold');
      UI.renderSceneBg();
    }
  }

  function currentDpsEstimate() {
    if (S.party.length === 0) return 0;
    return partyDps();
  }

  /* offline gains: kills/sec estimated from dps vs current enemy hp */
  function offlineGains(seconds) {
    const g = globalStage();
    const dps = partyDps() || 1;
    const eHp = 26 * Math.pow(1.31, g - 1);
    const killTime = Math.max(1.2, eHp / dps + 0.5);
    const kills = Math.floor(seconds / killTime * 0.85);
    const goldPer = 5 * Math.pow(1.24, g - 1);
    return {
      kills,
      gold: Math.floor(kills * goldPer),
      xp: Math.floor(kills * (2 + g * 0.55) * 0.35),
    };
  }

  return { tick, spawnEnemy, challengeBoss, currentDpsEstimate, offlineGains,
           get enemy() { return enemy; }, get partyHp() { return partyHp; },
           TICK_MS };
})();
