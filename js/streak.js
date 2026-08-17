/* ============ the streak ============

   A streak only works if it is impossible to ignore and expensive to lose, so
   this does four things the old counter did not:

     * KEEPS HISTORY. Which days you actually turned up, so a calendar can be
       drawn rather than a single number asserted.
     * REMEMBERS YOUR BEST. Beating it is its own reward.
     * SELLS A FREEZE. One missed day costs a freeze instead of the streak.
       Bought with gems, spent automatically, and it says so.
     * CELEBRATES MILESTONES. 3, 7, 14, 30, 60, 100, 200, 365 — each pays, each
       gets the full-screen treatment once.

   The freeze is applied lazily. Nothing runs in the background, so the check
   happens when the app next opens: count the days between then and now, and if
   exactly one was missed and a freeze is held, spend it and keep the run.   */
'use strict';

const Streak = (() => {
  const FREEZE_COST = 60;
  const FREEZE_MAX = 3;

  const MILESTONES = [
    { at: 3,   gems: 30,  gold: 1500,  name: 'Three days' },
    { at: 7,   gems: 60,  gold: 4000,  name: 'One week' },
    { at: 14,  gems: 100, gold: 9000,  name: 'Two weeks' },
    { at: 30,  gems: 200, gold: 25000, name: 'One month' },
    { at: 60,  gems: 350, gold: 60000, name: 'Two months' },
    { at: 100, gems: 600, gold: 120000, name: 'One hundred days' },
    { at: 200, gems: 1000, gold: 300000, name: 'Two hundred days' },
    { at: 365, gems: 2500, gold: 900000, name: 'A full year' },
  ];

  function st() {
    S.streak = S.streak || { count: 0, lastDay: null };
    if (typeof S.streak.best !== 'number') S.streak.best = S.streak.count || 0;
    if (typeof S.streak.freezes !== 'number') S.streak.freezes = 1;   // one free
    if (!S.streak.hit || typeof S.streak.hit !== 'object') S.streak.hit = {};
    if (!Array.isArray(S.streak.milestones)) S.streak.milestones = [];
    return S.streak;
  }

  function daysBetween(a, b) {
    const p = x => { const n = String(x).split('-').map(Number); return Date.UTC(n[0], n[1] - 1, n[2]); };
    return Math.round((p(b) - p(a)) / 86400000);
  }

  /* called once at start-up, before anything reads the count */
  function checkOnOpen() {
    const s = st();
    if (!s.lastDay) return null;
    const gap = daysBetween(s.lastDay, todayStr());
    if (gap <= 1) return null;                 // today or yesterday: run is alive
    if (gap === 2 && s.freezes > 0) {          // exactly one day missed
      s.freezes--;
      s.lastDay = todayStr(-1);                // pretend yesterday counted
      s.hit[s.lastDay] = 'freeze';
      save();
      return { froze: true, left: s.freezes };
    }
    const lost = s.count;
    s.count = 0;
    save();
    return lost > 2 ? { broke: true, lost } : null;
  }

  /* the day counted: called from bumpStreakToday */
  function markToday() {
    const s = st();
    const today = todayStr();
    s.hit[today] = true;
    // keep a rolling ~10 weeks; a calendar cannot show more than that anyway
    const keys = Object.keys(s.hit).sort();
    if (keys.length > 80) keys.slice(0, keys.length - 80).forEach(k => delete s.hit[k]);
    if (s.count > (s.best || 0)) s.best = s.count;
    const m = MILESTONES.find(x => x.at === s.count && !s.milestones.includes(x.at));
    if (m) {
      s.milestones.push(m.at);
      grantGems(m.gems);
      grantGold(m.gold);
      save();
      if (typeof UI !== 'undefined') {
        UI.celebrate({
          icon: 'streak', kind: 'streak',
          title: `${s.count} day streak`,
          sub: m.name + ' of showing up.',
          rewards: [`${icon('gem')}${m.gems}`, `${icon('gold')}${fmt(m.gold)}`],
        });
      }
    }
    save();
  }

  function next() { return MILESTONES.find(m => m.at > st().count) || null; }
  function buyFreeze() {
    const s = st();
    if (s.freezes >= FREEZE_MAX) { toast('Three is the most you can hold'); return false; }
    if (S.player.gems < FREEZE_COST) { toast('Not enough gems'); return false; }
    S.player.gems -= FREEZE_COST;
    s.freezes++;
    Sound.coin();
    save();
    if (typeof UI !== 'undefined') { UI.renderHud(); UI.showStreak(); }
    return true;
  }

  /* the last 5 weeks as rows of 7, oldest first, Monday-aligned */
  function calendar() {
    const out = [];
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;                  // Monday = 0
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 28);
    const s = st();
    for (let w = 0; w < 5; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        const key = dt.getFullYear() + '-' +
          String(dt.getMonth() + 1).padStart(2, '0') + '-' +
          String(dt.getDate()).padStart(2, '0');
        row.push({ key, day: dt.getDate(), hit: s.hit[key],
                   future: dt > now, today: key === todayStr() });
      }
      out.push(row);
    }
    return out;
  }

  return { st, checkOnOpen, markToday, next, buyFreeze, calendar,
           MILESTONES, FREEZE_COST, FREEZE_MAX };
})();
