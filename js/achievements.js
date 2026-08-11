/* ============ achievements ============

   Permanent, one-off, and read straight off the save. Nothing here needs a
   hook in another module: every row is a counter already being kept, so an
   existing save opens the list with whatever it has already earned ready to
   claim rather than starting from zero.

   Tiered on purpose. "Defeat 100 beasts" is a first-week reward; "defeat
   100,000" is a reason to still be here in a month. Claiming is manual because
   a reward you press for lands harder than one that appears.               */
'use strict';

const Achievements = (() => {
  /* tiers(name, icon, stat, [thresholds], rewardFor) expands into one row per
     threshold, so the table below stays readable */
  function tiers(id, icon, name, stat, marks, pay) {
    return marks.map((n, i) => ({
      key: id + i, icon, name: name(n), need: n, stat,
      gems: pay(i).gems, gold: pay(i).gold, ess: pay(i).ess, seeds: pay(i).seeds,
    }));
  }
  const step = (g, o, e, s) => i => ({
    gems: Math.round(g * Math.pow(2.1, i)),
    gold: o ? Math.round(o * Math.pow(2.6, i)) : 0,
    ess: e ? Math.round(e * Math.pow(2.2, i)) : 0,
    seeds: s ? Math.round(s * Math.pow(1.8, i)) : 0,
  });

  const LIST = [].concat(
    tiers('kill', 'sword', n => `Defeat ${fmt(n)} beasts`, () => S.kills,
          [100, 1000, 10000, 100000], step(20, 800)),
    tiers('boss', 'skull', n => n === 1 ? 'Beat your first boss' : `Beat ${n} bosses`,
          () => S.bossKills,
          [1, 10, 50, 200], step(30, 1200, 30)),
    tiers('streak', 'streak', n => `Keep a ${n}-day streak`, () => S.streak.count,
          [3, 7, 30, 100], step(40, 1500, 0, 4)),
    tiers('hours', 'timer', n => n === 1 ? 'Practise for a full hour'
                               : `Practise for ${n} hours`,
          () => Math.floor((S.dream.minutes || 0) / 60),
          [1, 10, 50, 200], step(50, 2000, 40)),
    tiers('dex', 'book', n => `Meet ${n} different beasts`, () => Object.keys(S.dex).length,
          [10, 50, 120, 288], step(25, 900, 25)),
    tiers('own', 'paw', n => `Bond with ${n} beasts`,
          () => Object.keys(S.beasts).length,
          [3, 15, 40, 100], step(30, 1000, 20)),
    tiers('level', 'star', n => `Reach level ${n}`, () => S.player.level,
          [5, 20, 50, 100], step(35, 1400)),
    tiers('sess', 'play', n => n === 1 ? 'Finish your first session'
                              : `Finish ${fmt(n)} practice sessions`,
          () => (S.dream.sessions || 0),
          [1, 10, 50, 200], step(30, 1100, 0, 3)),
    tiers('tier', 'relic', n => `Forge a tier-${n} piece`,
          () => Math.max(0, ...(S.merge.board || []).map(i => (i && i.tier) || 0)),
          [3, 5, 7, 9], step(30, 1000)),
    tiers('arena', 'sword', n => n === 1 ? 'Win your first duel' : `Win ${n} duels`,
          () => (S.arena.wins || 0),
          [1, 10, 50], step(35, 1200)),
    tiers('quest', 'scroll', n => `Claim ${n} quests`, () => (S.stats.questsClaimed || 0),
          [10, 100, 500], step(30, 1100, 0, 3)),
    tiers('goal', 'sunrise', n => `Run ${n} goals at once`, () => 1 + (S.sideGoals || []).length,
          [2, 3, 4], step(60, 2200))
  );

  function stateOf() {
    S.achv = S.achv || {};
    if (!Array.isArray(S.achv.claimed)) S.achv.claimed = [];
    return S.achv;
  }
  const isClaimed = k => stateOf().claimed.includes(k);
  function progress(a) {
    try { return a.stat() | 0; } catch (e) { return 0; }
  }
  const isDone = a => progress(a) >= a.need;
  function readyCount() { return LIST.filter(a => !isClaimed(a.key) && isDone(a)).length; }
  function claimedCount() { return stateOf().claimed.length; }
  function total() { return LIST.length; }

  /* the next unearned tier of each family, so the list shows a goal rather
     than forty rows the player cannot touch yet */
  function visible() {
    const seen = {};
    const out = [];
    for (const a of LIST) {
      const fam = a.key.replace(/\d+$/, '');
      if (isClaimed(a.key)) continue;
      if (isDone(a)) { out.push(a); continue; }        // claimable, always show
      if (seen[fam]) continue;                          // one locked row per family
      seen[fam] = 1;
      out.push(a);
    }
    // claimable first, then closest to done
    return out.sort((x, y) => {
      const dx = isDone(x) ? 0 : 1, dy = isDone(y) ? 0 : 1;
      if (dx !== dy) return dx - dy;
      return (progress(y) / y.need) - (progress(x) / x.need);
    });
  }

  function reward(a) {
    const bits = [];
    if (a.gems) bits.push(`${icon('gem')}${a.gems}`);
    if (a.gold) bits.push(`${icon('gold')}${fmt(a.gold)}`);
    if (a.ess) bits.push(`${icon('essence')}${a.ess}`);
    if (a.seeds) bits.push(`${icon('seed')}${a.seeds}`);
    return bits.join(' ');
  }

  function claim(key, btnEl) {
    const a = LIST.find(x => x.key === key);
    if (!a || isClaimed(key) || !isDone(a)) return false;
    stateOf().claimed.push(key);
    if (a.gems) grantGems(a.gems);
    if (a.gold) grantGold(a.gold);
    if (a.ess) grantEssence(a.ess);
    if (a.seeds) grantSeeds(a.seeds);
    grantPlayerXp(60);
    Events.add(8, 'achievement');
    Sound.levelup();
    confetti(34);
    if (btnEl) coinBurst(btnEl, 6);
    toast(a.name, 'gold');
    save();
    UI.renderAchievements();
    UI.renderHud();
    return true;
  }

  return { LIST, visible, claim, readyCount, claimedCount, total,
           progress, isDone, isClaimed, reward };
})();
