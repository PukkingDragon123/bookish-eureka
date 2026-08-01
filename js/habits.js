/* ============ Ritual Beasts — real-life rituals (habits) ============ */
'use strict';

const Habits = (() => {

  /* Built-in rituals. reward values are per completion.
     kinds: instant (tap), timer (real countdown), meal (opens food log) */
  const DEFS = [
    { id: 'wake', icon: '🌅', name: 'Morning Check-in', kind: 'instant', perDay: 1,
      desc: 'Greet the day. Grants the Dawn Blessing: +15% gold & XP for 4h.',
      mana: 20, xp: 30, ess: 0,
      goal: 'mind' },
    { id: 'water', icon: '💧', name: 'Drink Water', kind: 'instant', perDay: 8,
      desc: 'Each glass channels 12 mana toward your next summon.',
      mana: 12, xp: 6, ess: 0,
      goal: 'mind' },
    { id: 'meal', icon: '🥗', name: 'Eat a Healthy Meal', kind: 'meal', perDay: 3,
      desc: 'Log what you ate (and it feeds the calorie ring below).',
      mana: 25, xp: 16, ess: 1,
      goal: 'nutrition' },
    { id: 'cook', icon: '🍳', name: 'Cook Something', kind: 'instant', perDay: 1,
      desc: 'Home-cooked = beast-approved. Bonus essence for the craft.',
      mana: 18, xp: 22, ess: 2,
      goal: 'nutrition' },
    { id: 'walk', icon: '🚶', name: 'Take a Walk', kind: 'timer', perDay: 2, mins: [10, 15, 20, 30],
      desc: 'A real-time walk timer. Finish it for mana & essence.',
      manaPerMin: 1.2, xpPerMin: 2, essPer10: 1,
      goal: 'fitness' },
    { id: 'exercise', icon: '💪', name: 'Exercise Session', kind: 'timer', perDay: 2, mins: [10, 15, 20, 30, 45, 60],
      desc: 'Real workout, real timer. Completing it triples idle rewards for 2× the duration!',
      manaPerMin: 1.5, xpPerMin: 3, essPer10: 2, boost: true,
      goal: 'fitness' },
    { id: 'create', icon: '🎨', name: 'Create / Practice', kind: 'timer', perDay: 2, mins: [15, 25, 45],
      desc: 'Draw, write, play, build. Deep-work time becomes essence.',
      manaPerMin: 1, xpPerMin: 2.5, essPer10: 2,
      goal: 'create' },
  ];

  function defById(hid) {
    return DEFS.find(d => d.id === hid) || S.custom.find(c => c.id === hid);
  }

  function doneToday(hid) {
    const rec = S.habits[hid];
    const today = todayStr();
    if (!rec || rec.day !== today) return 0;
    return rec.done;
  }
  function markDone(hid) {
    const today = todayStr();
    let rec = S.habits[hid];
    if (!rec || rec.day !== today) rec = S.habits[hid] = { day: today, done: 0 };
    rec.done++;
    bumpStreakToday();
  }

  /* ---------- instant ritual completion ---------- */
  function completeInstant(def, btnEl) {
    const max = def.perDay || 1;
    if (doneToday(def.id) >= max) return;
    markDone(def.id);
    const sm = streakMult();
    const mana = grantMana(Math.round((def.mana || 10) * sm));
    const xp = grantPlayerXp(Math.round((def.xp || 8) * sm));
    if (def.ess) grantEssence(def.ess);
    if (def.id === 'wake') {
      S.boosts.blessingUntil = Date.now() + 4 * 3600 * 1000;
      toast('🌅 Dawn Blessing active: +15% gold & XP for 4h', 'gold');
    }
    celebrate(btnEl, mana, xp, def.ess || 0);
    Quests.progress('habit_' + def.id, 1);
    Quests.progress('any_habit', 1);
    save();
    UI.renderRituals();
    UI.renderHud();
  }

  /* ---------- meals & calories ---------- */
  function resetMealsIfNewDay() {
    const today = todayStr();
    if (S.mealsDay !== today) {
      // yesterday's calorie-target bonus
      if (S.mealsDay && S.meals.length > 0) {
        const total = S.meals.reduce((a, m) => a + m.kcal, 0);
        if (total > 0 && total <= S.kcalTarget && S.kcalBonusDay !== S.mealsDay) {
          S.kcalBonusDay = S.mealsDay;
          grantGems(8);
          grantEssence(6);
          toast('🎯 Yesterday you stayed within your calorie target! +8💎 +6✨', 'gold');
        }
      }
      S.meals = [];
      S.mealsDay = today;
    }
  }

  function logMeal(name, kcal, healthy, btnEl) {
    resetMealsIfNewDay();
    S.meals.push({ name: name || 'Meal', kcal: Math.max(0, kcal || 0), ts: Date.now() });
    Quests.progress('meals_logged', 1);
    if (healthy) {
      const def = DEFS.find(d => d.id === 'meal');
      if (doneToday('meal') < def.perDay) {
        markDone('meal');
        const sm = streakMult();
        const mana = grantMana(Math.round(def.mana * sm));
        const xp = grantPlayerXp(Math.round(def.xp * sm));
        grantEssence(def.ess);
        celebrate(btnEl, mana, xp, def.ess);
        Quests.progress('habit_meal', 1);
        Quests.progress('any_habit', 1);
      } else {
        toast('Meal logged 📝');
      }
    } else {
      toast('Meal logged 📝 (honesty is power)');
      grantPlayerXp(4);
    }
    save();
    UI.renderRituals();
    UI.renderFood();
    UI.renderHud();
  }

  function kcalToday() {
    resetMealsIfNewDay();
    return S.meals.reduce((a, m) => a + m.kcal, 0);
  }

  /* ---------- timers (exercise / walk / create) ---------- */
  function startTimer(hid, mins) {
    if (S.exTimer) { toast('A ritual timer is already running'); return false; }
    S.exTimer = { hid, mins, startedAt: Date.now() };
    save();
    return true;
  }
  function cancelTimer() {
    S.exTimer = null;
    save();
  }
  function timerRemaining() {
    if (!S.exTimer) return 0;
    const total = S.exTimer.mins * 60 * 1000;
    return Math.max(0, S.exTimer.startedAt + total - Date.now());
  }
  /* called from the main loop */
  function tickTimer() {
    if (!S.exTimer) return;
    if (timerRemaining() <= 0) finishTimer();
  }
  function finishTimer() {
    const t = S.exTimer;
    if (!t) return;
    S.exTimer = null;
    const def = defById(t.hid);
    if (!def) return;
    markDone(def.id);
    const sm = streakMult();
    const mana = grantMana(Math.round((def.manaPerMin || 1) * t.mins * sm));
    const xp = grantPlayerXp(Math.round((def.xpPerMin || 2) * t.mins * sm));
    const ess = grantEssence(Math.round((def.essPer10 || 1) * t.mins / 10));
    if (def.boost) {
      S.boosts.exerciseUntil = Date.now() + t.mins * 2 * 60 * 1000;
      toast(`⚡ x3 idle rewards for ${t.mins * 2} minutes!`, 'gold');
    }
    Sound.timerDone();
    confetti(40);
    toast(`${def.icon} ${def.name} complete! +${mana}🔮 +${xp}XP +${ess}✨`, 'good');
    Quests.progress('habit_' + def.id, 1);
    Quests.progress('timer_mins', t.mins);
    Quests.progress('any_habit', 1);
    save();
    closeAllModals();
    UI.renderRituals();
    UI.renderHud();
  }

  /* ---------- custom rituals ---------- */
  function addCustom(name, icon) {
    const id = 'custom_' + Date.now();
    S.custom.push({ id, name: name.slice(0, 28), icon: icon || '⭐', kind: 'instant', perDay: 1,
                    mana: 15, xp: 15, ess: 1, desc: 'Your own ritual.' });
    save();
    UI.renderRituals();
  }
  function removeCustom(id) {
    S.custom = S.custom.filter(c => c.id !== id);
    save();
    UI.renderRituals();
  }

  /* ---------- celebration ---------- */
  function celebrate(fromEl, mana, xp, ess) {
    Sound.habit();
    confetti(18);
    if (fromEl) {
      const r = fromEl.getBoundingClientRect();
      const mkFloat = (txt, cls, dy) => {
        const f = el('div', 'dmg-float ' + cls, txt);
        f.style.position = 'fixed';
        f.style.left = (r.left + r.width / 2 - 20) + 'px';
        f.style.top = (r.top - 8 + dy) + 'px';
        f.style.zIndex = 300;
        document.body.appendChild(f);
        setTimeout(() => f.remove(), 1300);
      };
      if (mana) mkFloat(`+${mana} 🔮`, 'mana-f', 0);
      if (xp) setTimeout(() => mkFloat(`+${xp} XP`, 'xp-f', 8), 140);
      if (ess) setTimeout(() => mkFloat(`+${ess} ✨`, 'heal', 16), 280);
    }
  }

  return { DEFS, defById, doneToday, completeInstant, logMeal, kcalToday,
           startTimer, cancelTimer, timerRemaining, tickTimer, finishTimer,
           addCustom, removeCustom, resetMealsIfNewDay };
})();
