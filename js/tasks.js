/* ============ Vale's tasks — the tutorial as a quest board ============

   A guided tour that dims the screen and types at you is something you sit
   through. This is a list instead: seven starter tasks from Professor Vale,
   each one a real thing to go and do, each paying real currency, each ticked
   off by reading the game's own state rather than by watching you tap.

   Nothing here blocks. There is no overlay, no spotlight and no dialogue. The
   board sits on Today until the last task is claimed, then removes itself.

   Every task's `done()` reads live state, so progress is correct even if the
   player did it before the board appeared — an existing save that has already
   beaten a boss opens the board with that task ready to claim.           */
'use strict';

const Tasks = (() => {
  const LIST = [
    { key: 'battle', icon: 'sword', name: 'Watch your party fight',
      hint: 'Open the Battle tab. They swing on their own, awake or not.',
      gems: 15, gold: 400,
      done: () => S.kills > 0,
      go: () => UI.switchTab('battle') },

    { key: 'session', icon: 'timer', name: 'Finish one practice session',
      hint: 'The timer on Today. Real minutes are the only source of mana.',
      gems: 50, gold: 1500,
      done: () => (S.dream && S.dream.sessions > 0),
      go: () => UI.switchTab('today') },

    { key: 'quest', icon: 'scroll', name: 'Claim a daily quest',
      hint: 'Quests tab. Do the habit, then take the reward.',
      gems: 25, gold: 600,
      done: () => (S.quests.list || []).some(q => q.claimed),
      go: () => UI.switchTab('quests') },

    { key: 'forge', icon: 'portal', name: 'Fuse two pieces of gear',
      hint: 'Battle tab, open the Forge, drag one piece onto its match.',
      gems: 30, gold: 800,
      // a tier-2 piece can only exist because two tier-1s were fused
      done: () => (S.merge.board || []).some(it => it && it.tier >= 2),
      go: () => { UI.switchTab('battle'); S.settings.panels.fusion = true; UI.renderMerge(); } },

    { key: 'feed', icon: 'meal', name: 'Feed a beast',
      hint: 'Garden tab. Match its element and the XP doubles.',
      gems: 25, seeds: 4,
      done: () => Object.values(S.beasts).some(b => b && b.fed),
      go: () => UI.switchTab('farm') },

    { key: 'level', icon: 'star', name: 'Get a beast to Lv.5',
      hint: 'Gold levels them fastest. Food and practice do it too.',
      gems: 40, gold: 1200,
      done: () => Object.values(S.beasts).some(b => b && b.level >= 5),
      go: () => UI.switchTab('beasts') },

    { key: 'boss', icon: 'skull', name: 'Beat a boss',
      hint: 'Wave 10 of any stage. Bring the type it is weak to.',
      gems: 60, gold: 2500, ess: 40,
      done: () => S.bossKills > 0,
      go: () => UI.switchTab('battle') },
  ];

  function state() {
    S.tutorial = S.tutorial || {};
    if (!Array.isArray(S.tutorial.claimed)) S.tutorial.claimed = [];
    return S.tutorial;
  }

  /* the board is finished once every task has been claimed — the old
     tutorial's `done` flag is deliberately ignored, so a player who skipped
     the tour still gets the tasks and their rewards */
  function done() { return state().claimed.length >= LIST.length; }
  function readyCount() {
    const c = state().claimed;
    return LIST.filter(t => !c.includes(t.key) && t.done()).length;
  }
  function claimedCount() { return state().claimed.length; }

  function rewardText(t) {
    const bits = [];
    if (t.gems) bits.push(`${icon('gem')}${t.gems}`);
    if (t.gold) bits.push(`${icon('gold')}${fmt(t.gold)}`);
    if (t.seeds) bits.push(`${icon('seed')}${t.seeds}`);
    if (t.ess) bits.push(`${icon('essence')}${t.ess}`);
    return bits.join(' ');
  }

  function claim(key, btnEl) {
    const t = LIST.find(x => x.key === key);
    const st = state();
    if (!t || st.claimed.includes(key) || !t.done()) return false;
    st.claimed.push(key);
    if (t.gems) grantGems(t.gems);
    if (t.gold) grantGold(t.gold);
    if (t.seeds) grantSeeds(t.seeds);
    if (t.ess) grantEssence(t.ess);
    Events.add(10, 'task');
    Sound.quest();
    confetti(26);
    if (btnEl) coinBurst(btnEl, 5);
    if (done()) {
      grantGems(100);
      confetti(70);
      Sound.levelup();
      toast('All of Vale\'s tasks done — 100 bonus gems', 'gold');
    } else {
      toast(`${t.name} — reward taken`, 'gold');
    }
    save();
    UI.renderTasks();
    UI.renderHud();
    return true;
  }

  return { LIST, state, done, readyCount, claimedCount, rewardText, claim };
})();
