/* ============ weekly events ============

   One event runs at a time and rotates every Monday. Which one is decided by
   the week number, not by a roll, so it is the same all week, survives a
   reload, and the next one is predictable rather than random noise.

   Two halves:

     * A MODIFIER, applied inside the grant functions in state.js, so it lifts
       every payout of that kind wherever it comes from.
     * A REWARD TRACK. Playing during the event earns event points; five tiers
       hand out gold, gems, seeds, essence and a final chest. Points come from
       real activity — practice minutes, quests, timers, bosses — so the track
       fills by using the app, not by leaving it open.

   Everything resets on the week boundary, and unclaimed tiers are lost, which
   is the point of a limited event.                                        */
'use strict';

const Events = (() => {
  const WEEK = 7 * 24 * 3600 * 1000;
  /* the unix epoch was a Thursday; shifting by 4 days puts week boundaries on
     Monday 00:00 UTC, which is when the event flips */
  const SHIFT = 4 * 24 * 3600 * 1000;

  const EVENTS = [
    { id: 'gold', name: 'Gold Rush', icon: 'gold',
      blurb: 'Every coin your party wins is doubled.',
      mult: { gold: 2 } },
    { id: 'ember', name: 'Ember Festival', icon: 'bolt',
      blurb: 'Battles pay double XP. Your beasts level twice as fast.',
      mult: { xp: 2, beastxp: 2 } },
    { id: 'harvest', name: 'Harvest Moon', icon: 'seed',
      blurb: 'The garden yields double, and seeds come twice as often.',
      mult: { seeds: 2, food: 2 } },
    { id: 'focus', name: 'Deep Focus', icon: 'mana',
      blurb: 'Practice pays half as much again in mana.',
      mult: { mana: 1.5 } },
    { id: 'essence', name: 'Wild Hunt', icon: 'essence',
      blurb: 'Essence drops double. A good week to evolve something.',
      mult: { ess: 2 } },
    { id: 'founders', name: "Keeper's Week", icon: 'star',
      blurb: 'Gold, XP and mana all up by a quarter.',
      mult: { gold: 1.25, xp: 1.25, mana: 1.25 } },
  ];

  /* five tiers, worth clearly more than a day of quests — the whole point of
     an event is that the week is worth showing up for */
  const TIERS = [
    { at: 30,  icon: 'gold',    text: '1,500 gold', grant: () => grantGold(1500) },
    { at: 80,  icon: 'gem',     text: '25 gems',    grant: () => grantGems(25) },
    { at: 160, icon: 'seed',    text: '8 seeds',    grant: () => grantSeeds(8) },
    { at: 260, icon: 'essence', text: '120 essence', grant: () => grantEssence(120) },
    { at: 400, icon: 'chest',   text: 'Event chest',
      grant: () => { grantGems(80); grantGold(6000); grantSeeds(6); grantEssence(80); } },
  ];

  function weekId() { return Math.floor((Date.now() + SHIFT) / WEEK); }
  function current() { return EVENTS[weekId() % EVENTS.length]; }
  function endsAt() { return (weekId() + 1) * WEEK - SHIFT; }
  function msLeft() { return Math.max(0, endsAt() - Date.now()); }

  /* the live track, rolled over the moment the week changes */
  function track() {
    if (!S.event || S.event.week !== weekId()) {
      S.event = { week: weekId(), points: 0, claimed: [] };
    }
    if (!Array.isArray(S.event.claimed)) S.event.claimed = [];
    return S.event;
  }

  function mult(key) {
    const m = current().mult;
    return (m && m[key]) || 1;
  }

  /* called from the places where real activity happens */
  function add(points, why) {
    if (!(points > 0)) return;
    const t = track();
    const before = readyCount();
    t.points += Math.round(points);
    if (readyCount() > before) {
      toast('Event reward ready to claim', 'gold');
      Sound.quest();
    }
    if (typeof UI !== 'undefined') UI.renderEvent();
  }

  function readyCount() {
    const t = track();
    return TIERS.filter((tier, i) => t.points >= tier.at && !t.claimed.includes(i)).length;
  }

  function claim(i) {
    const t = track();
    const tier = TIERS[i];
    if (!tier || t.points < tier.at || t.claimed.includes(i)) return false;
    t.claimed.push(i);
    tier.grant();
    Sound.coin();
    confetti(28);
    toast(`${tier.text} claimed`, 'gold');
    save();
    if (typeof UI !== 'undefined') { UI.renderEvent(); UI.renderHud(); }
    return true;
  }

  function progressPct() {
    const t = track();
    return Math.min(100, 100 * t.points / TIERS[TIERS.length - 1].at);
  }

  return { EVENTS, TIERS, current, endsAt, msLeft, track, mult, add,
           claim, readyCount, progressPct };
})();
