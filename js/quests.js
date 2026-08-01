/* ============ Ritual Beasts — personalized daily quests ============ */
'use strict';

const Quests = (() => {

  /* quest templates keyed by goal; {} = battle/general */
  const TEMPLATES = {
    fitness: [
      { key: 'habit_exercise', icon: '💪', name: 'Complete an exercise session', target: 1, reward: { gems: 6, ess: 4 } },
      { key: 'habit_walk', icon: '🚶', name: 'Finish a walk timer', target: 1, reward: { gems: 4, mana: 30 } },
      { key: 'timer_mins', icon: '⏱️', name: 'Put in 20 active minutes', target: 20, reward: { gems: 5, ess: 3 } },
    ],
    nutrition: [
      { key: 'habit_meal', icon: '🥗', name: 'Eat 2 healthy meals', target: 2, reward: { gems: 5, ess: 3 } },
      { key: 'meals_logged', icon: '📝', name: 'Log 3 foods in the tracker', target: 3, reward: { gems: 4, mana: 25 } },
      { key: 'habit_cook', icon: '🍳', name: 'Cook something yourself', target: 1, reward: { gems: 5, ess: 2 } },
    ],
    mind: [
      { key: 'habit_wake', icon: '🌅', name: 'Do your morning check-in', target: 1, reward: { gems: 4, mana: 20 } },
      { key: 'habit_water', icon: '💧', name: 'Drink 5 glasses of water', target: 5, reward: { gems: 5, mana: 30 } },
      { key: 'any_habit', icon: '🌿', name: 'Complete 4 rituals today', target: 4, reward: { gems: 6, ess: 3 } },
    ],
    create: [
      { key: 'habit_create', icon: '🎨', name: 'Finish a create session', target: 1, reward: { gems: 6, ess: 4 } },
      { key: 'timer_mins', icon: '⏱️', name: 'Spend 25 minutes in deep work', target: 25, reward: { gems: 5, ess: 3 } },
      { key: 'any_habit', icon: '⭐', name: 'Complete 3 rituals today', target: 3, reward: { gems: 4, mana: 25 } },
    ],
    battle: [
      { key: 'kills', icon: '⚔️', name: 'Defeat 40 wild beasts', target: 40, reward: { gold: true, gems: 3 } },
      { key: 'boss', icon: '☠️', name: 'Defeat a boss', target: 1, reward: { gems: 5, ess: 3 } },
      { key: 'summon', icon: '🔮', name: 'Perform a summon', target: 1, reward: { gems: 4, mana: 15 } },
      { key: 'levelup_beast', icon: '📈', name: 'Level up beasts 3 times', target: 3, reward: { gems: 4, ess: 2 } },
    ],
  };

  function seededShuffle(arr, seed) {
    const rng = (() => { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateToday() {
    const day = todayStr();
    if (S.quests.day === day) return;
    const seed = parseInt(day.replace(/-/g, ''), 10);
    const goalPool = [];
    const goals = S.goals.length ? S.goals : ['mind'];
    goals.forEach((g, i) => {
      const t = seededShuffle(TEMPLATES[g] || [], seed + i);
      goalPool.push(...t.slice(0, 2));
    });
    const battle = seededShuffle(TEMPLATES.battle, seed + 7).slice(0, 2);
    const list = [...goalPool.slice(0, 3), ...battle].map((t, i) => ({
      qid: day + '_' + i,
      key: t.key, icon: t.icon, name: t.name, target: t.target,
      progress: 0, claimed: false, reward: t.reward,
    }));
    S.quests = { day, list };
    save();
  }

  function progress(key, n) {
    if (!S.quests.list) return;
    let changed = false;
    for (const q of S.quests.list) {
      if (q.key === key && !q.claimed && q.progress < q.target) {
        q.progress = Math.min(q.target, q.progress + n);
        changed = true;
        if (q.progress >= q.target) {
          toast(`🗺️ Quest ready to claim: ${q.name}`, 'good');
          UI.markQuestDot(true);
        }
      }
    }
    if (changed && UI.currentTab() === 'quests') UI.renderQuests();
  }

  function claim(qid, btnEl) {
    const q = S.quests.list.find(x => x.qid === qid);
    if (!q || q.claimed || q.progress < q.target) return;
    q.claimed = true;
    const r = q.reward;
    const bits = [];
    if (r.gems) { grantGems(r.gems); bits.push(`+${r.gems}💎`); }
    if (r.mana) { grantMana(r.mana); bits.push(`+${r.mana}🔮`); }
    if (r.ess) { grantEssence(r.ess); bits.push(`+${r.ess}✨`); }
    if (r.gold) { const g = grantGold(60 * Math.pow(1.2, globalStage())); bits.push(`+${fmt(g)}🪙`); }
    Sound.quest();
    confetti(24);
    if (btnEl) coinBurst(btnEl, 5, '💎');
    toast(`Quest complete! ${bits.join(' ')}`, 'gold');
    grantPlayerXp(25);
    save();
    UI.renderQuests();
    UI.renderHud();
    if (S.quests.list.every(x => x.claimed)) UI.markQuestDot(false);
  }

  return { generateToday, progress, claim };
})();
