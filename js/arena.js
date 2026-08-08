/* ============ Arena — rivals, duels and tournaments ============

   READ THIS BEFORE EXPECTING MATCHMAKING. Hourling is one static file with no
   server, so there is no lobby, no matchmaking queue and no live opponent.
   What there is instead is genuine and works offline:

     * Your team can be exported as a RIVAL CODE — a short string holding a
       snapshot of your party (who, what level, how strong).
     * Paste a friend's code and they become a standing rival you can fight
       whenever you like. You really are fighting their team as it was when
       they made the code, not an invention.
     * Everyone else in here is an NPC challenger, scaled around your power.
     * Duels and tournaments are simulated locally, blow by blow, from both
       teams' real stats.

   So it is asynchronous PvP by exchanged codes, not online PvP. Anything
   claiming otherwise would need a backend this app does not have, and the UI
   says so out loud rather than implying a server exists.                    */
'use strict';

const Arena = (() => {
  const CODE_VER = 'HR1';
  const START_RATING = 1000;

  /* NPC challengers. Fixed personalities so the ladder has faces, with power
     derived from yours so they stay relevant as you grow. */
  const NPCS = [
    { id: 'npc_rin',  name: 'Rin the Patient',   blurb: 'Never rushes a rung', k: 0.72, cid: '02_00' },
    { id: 'npc_hob',  name: 'Hob',               blurb: 'All offence, no plan', k: 0.86, cid: '17_02' },
    { id: 'npc_mira', name: 'Mira Dawnwake',     blurb: 'Practises before sunrise', k: 1.0, cid: '13_00' },
    { id: 'npc_sable',name: 'Sable',             blurb: 'Fights out of spite', k: 1.15, cid: '14_08' },
    { id: 'npc_vale', name: 'Professor Vale',    blurb: 'Wants to see your form', k: 1.3, cid: '08_12' },
    { id: 'npc_orin', name: 'Orin of the Falls', blurb: 'Ten years, same drill', k: 1.55, cid: '12_02' },
    { id: 'npc_kess', name: 'Kess',              blurb: 'Undefeated, allegedly', k: 1.9, cid: '17_06' },
  ];

  function st() {
    if (!S.arena || typeof S.arena !== 'object') {
      S.arena = { rating: START_RATING, wins: 0, losses: 0, rivals: [], tourney: null, day: null, fights: 0 };
    }
    const a = S.arena;
    if (!Array.isArray(a.rivals)) a.rivals = [];
    if (typeof a.rating !== 'number') a.rating = START_RATING;
    a.wins |= 0; a.losses |= 0; a.fights |= 0;
    if (a.day !== todayStr()) { a.day = todayStr(); a.fights = 0; }
    return a;
  }

  /* ---------------- team snapshots ---------------- */
  function myTeam() {
    const members = S.party.filter(cid => C_BY_ID[cid]).slice(0, 4).map(cid => ({
      cid, lv: (S.beasts[cid] && S.beasts[cid].level) | 0 || 1,
    }));
    return {
      name: (Account.googleUser() && Account.googleUser().name) || Account.active().name || 'Player',
      power: Battle.combatPower(),
      lvl: S.player.level,
      members,
    };
  }

  function exportCode() {
    const t = myTeam();
    const compact = [t.name.slice(0, 18), t.power, t.lvl,
                     t.members.map(m => m.cid + ':' + m.lv).join(',')].join('|');
    return CODE_VER + '.' + btoa(unescape(encodeURIComponent(compact)));
  }

  function parseCode(code) {
    try {
      code = String(code || '').trim().replace(/\s+/g, '');
      if (code.indexOf(CODE_VER + '.') !== 0) throw 0;
      const raw = decodeURIComponent(escape(atob(code.slice(CODE_VER.length + 1))));
      const [name, power, lvl, mem] = raw.split('|');
      const members = (mem || '').split(',').filter(Boolean).map(s => {
        const [cid, lv] = s.split(':');
        return C_BY_ID[cid] ? { cid, lv: clamp(lv | 0, 1, 200) } : null;
      }).filter(Boolean);
      if (!members.length) throw 0;
      return { name: (name || 'Rival').slice(0, 18), power: Math.max(1, power | 0),
               lvl: Math.max(1, lvl | 0), members, rival: true };
    } catch (e) { return null; }
  }

  function addRival(code) {
    const t = parseCode(code);
    if (!t) { toast('That is not a rival code'); return false; }
    const a = st();
    if (a.rivals.some(r => r.name === t.name && r.power === t.power)) {
      toast(`${t.name} is already on your list`);
      return false;
    }
    if (a.rivals.length >= 8) a.rivals.shift();
    t.id = 'rv_' + Date.now().toString(36);
    a.rivals.push(t);
    save();
    toast(`${t.name} added as a rival`, 'gold');
    return true;
  }

  function removeRival(id) {
    const a = st();
    a.rivals = a.rivals.filter(r => r.id !== id);
    save();
  }

  /* an NPC team built around your own power, so the ladder keeps meaning */
  function npcTeam(n) {
    const base = Math.max(40, Battle.combatPower());
    const c = C_BY_ID[n.cid] || SUMMON_POOL[0];
    return {
      id: n.id, name: n.name, blurb: n.blurb, npc: true,
      power: Math.round(base * n.k),
      lvl: Math.max(1, Math.round(S.player.level * n.k)),
      members: [{ cid: c.id, lv: Math.max(1, Math.round(S.player.level * n.k)) }],
    };
  }

  function opponents() {
    return NPCS.map(npcTeam).concat(st().rivals.map(r => ({ ...r })));
  }

  /* ---------------- the duel ----------------
     Both sides are reduced to power, then trade blows over a handful of
     rounds. Randomness is wide enough that an underdog can win but narrow
     enough that power still decides most fights. Returns a log the UI can
     play out beat by beat. */
  function duel(mine, theirs) {
    let a = Math.max(1, mine.power), b = Math.max(1, theirs.power);
    let ah = 100, bh = 100;
    const log = [];
    for (let round = 1; round <= 6 && ah > 0 && bh > 0; round++) {
      const aRoll = a * rnd(0.72, 1.34);
      const bRoll = b * rnd(0.72, 1.34);
      const total = aRoll + bRoll;
      const aHit = Math.round(28 * (aRoll / total) * 2);
      const bHit = Math.round(28 * (bRoll / total) * 2);
      bh = Math.max(0, bh - aHit);
      if (bh > 0) ah = Math.max(0, ah - bHit);
      log.push({ round, aHit, bHit: bh > 0 ? bHit : 0, ah, bh });
    }
    const won = bh <= 0 || ah > bh;
    return { won, log, ah, bh };
  }

  function ratingDelta(mine, theirs, won) {
    const exp = 1 / (1 + Math.pow(10, ((theirs.power || 1) - (mine.power || 1)) / 400));
    return Math.round(28 * ((won ? 1 : 0) - exp));
  }

  const DAILY_FIGHTS = 10;
  function fightsLeft() { return Math.max(0, DAILY_FIGHTS - st().fights); }

  function fight(oppId) {
    const a = st();
    if (fightsLeft() <= 0) { toast('No duels left today — they reset tomorrow'); return null; }
    const opp = opponents().find(o => o.id === oppId);
    if (!opp) return null;
    const mine = myTeam();
    const res = duel(mine, opp);
    a.fights++;
    const d = ratingDelta(mine, opp, res.won);
    a.rating = Math.max(0, a.rating + d);
    if (res.won) a.wins++; else a.losses++;

    // winning pays; losing still pays a little, so laddering is never a waste
    const reward = res.won
      ? { gems: 6 + Math.round(Math.max(0, d) / 3), gold: Math.round(300 * Math.pow(1.15, globalStage())) }
      : { gems: 1, gold: Math.round(80 * Math.pow(1.15, globalStage())) };
    grantGems(reward.gems);
    grantGold(reward.gold);
    Quests.progress('arena', 1);
    save();
    return { ...res, opp, mine, delta: d, reward };
  }

  /* ---------------- tournament ----------------
     Eight entrants, three rounds, single elimination. The bracket is drawn
     once and stored, so it survives a reload mid-run. */
  function startTournament() {
    const a = st();
    const pool = opponents();
    // seven challengers around your level, shuffled
    const picks = pool.slice().sort(() => Math.random() - 0.5).slice(0, 7);
    while (picks.length < 7) picks.push(npcTeam(NPCS[picks.length % NPCS.length]));
    const me = { ...myTeam(), id: 'me', me: true };
    const entrants = picks.concat([me]).sort(() => Math.random() - 0.5);
    a.tourney = { round: 0, entrants, alive: entrants.map(e => e.id), history: [], done: false, won: false };
    save();
    return a.tourney;
  }

  /* play one round of the bracket, returning what happened */
  function tourneyRound() {
    const a = st();
    const t = a.tourney;
    if (!t || t.done) return null;
    const alive = t.alive.map(id => t.entrants.find(e => e.id === id)).filter(Boolean);
    const pairs = [];
    for (let i = 0; i < alive.length; i += 2) pairs.push([alive[i], alive[i + 1]]);
    const results = [];
    const nextAlive = [];
    for (const [x, y] of pairs) {
      if (!y) { nextAlive.push(x.id); results.push({ bye: true, x }); continue; }
      const r = duel(x, y);
      const winner = r.won ? x : y;
      nextAlive.push(winner.id);
      results.push({ x, y, winner, mine: x.me || y.me, iWon: winner.me === true });
    }
    t.round++;
    t.alive = nextAlive;
    t.history.push(results);
    const meAlive = nextAlive.indexOf('me') >= 0;
    if (!meAlive || nextAlive.length <= 1) {
      t.done = true;
      t.won = meAlive && nextAlive.length <= 1;
      // placing pays out once, scaled by how far you got
      const placed = t.won ? 'win' : t.round >= 3 ? 'final' : t.round === 2 ? 'semi' : 'first';
      const pay = { win: { gems: 60, gold: 4000 }, final: { gems: 30, gold: 2000 },
                    semi: { gems: 15, gold: 900 }, first: { gems: 5, gold: 300 } }[placed];
      grantGems(pay.gems); grantGold(pay.gold);
      t.payout = pay; t.placed = placed;
      if (t.won) { a.rating += 40; Quests.progress('arena', 3); }
    }
    save();
    return { results, done: t.done, won: t.won, round: t.round, payout: t.payout, placed: t.placed };
  }

  function tourney() { return st().tourney; }
  function clearTournament() { st().tourney = null; save(); }

  function rank() {
    const r = st().rating;
    if (r >= 1600) return { name: 'Ascendant', col: '#ffc247' };
    if (r >= 1400) return { name: 'Champion', col: '#b47cff' };
    if (r >= 1200) return { name: 'Contender', col: '#45a6ff' };
    if (r >= 1050) return { name: 'Challenger', col: '#4ade80' };
    return { name: 'Newcomer', col: '#8f9bb8' };
  }

  return { st, myTeam, exportCode, parseCode, addRival, removeRival, opponents,
           fight, fightsLeft, DAILY_FIGHTS, startTournament, tourneyRound,
           tourney, clearTournament, rank, duel };
})();
