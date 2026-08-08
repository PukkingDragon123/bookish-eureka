/* ============ Hourling — game state, save/load, economy ============ */
'use strict';

/* The default save slot. Kept as dreamkeep-save-v4 deliberately: renaming it
   during the rebrand would orphan every existing player's progress. Profiles
   (js/account.js) point at their own keys through saveKeyFor(). */
const SAVE_KEY = 'dreamkeep-save-v4';
function saveKeyFor() {
  return (typeof Account !== 'undefined' && Account.saveKey) ? Account.saveKey() : SAVE_KEY;
}

/* ---------- static lookups ---------- */
const C_BY_ID = {};
window.CREATURES.forEach(c => { C_BY_ID[c.id] = c; });
const LINES = {};
window.CREATURES.forEach(c => {
  if (c.line) (LINES[c.line] = LINES[c.line] || []).push(c);
});
Object.values(LINES).forEach(l => l.sort((a, b) => a.stage - b.stage));

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_W = { common: 55, uncommon: 28, rare: 12, epic: 4.2, legendary: 0.8 };
const RARITY_W_GEM = { common: 12, uncommon: 30, rare: 38, epic: 16, legendary: 4 };
const RARITY_MULT = { common: 1, uncommon: 1.15, rare: 1.35, epic: 1.6, legendary: 2 };

/* summonable pool: stage-1 creatures only (evolutions come from playing) */
const SUMMON_POOL = window.CREATURES.filter(c => c.stage === 1);

const AREAS = [
  { key: 'meadow', name: 'Dewy Meadow', bg: 'assets/bg/meadow.png' },
  { key: 'plains', name: 'Sunwash Plains', bg: 'assets/bg/plains.png' },
  { key: 'falls', name: 'Whisperfall Ruins', bg: 'assets/bg/falls.gif' },
  { key: 'frost', name: 'Frostpeak Pass', bg: 'assets/bg/frost.jpg' },
];
const STAGES_PER_AREA = 10;
const WAVES_PER_STAGE = 10; // wave 10 = boss

const GOALS = {
  fitness:   { name: 'Move More', icon: 'muscle', desc: 'Exercise, walks, energy' },
  nutrition: { name: 'Eat Better', icon: 'meal', desc: 'Meals, cooking, calories' },
  mind:      { name: 'Clear Mind', icon: 'water', desc: 'Mornings, water, rest' },
  create:    { name: 'Create Daily', icon: 'palette', desc: 'Draw, write, practice' },
};

/* starter choices per goal: [lineId creatures resolved at runtime] */
const STARTERS = {
  fitness:   ['17_02', '08_12'],   // Kindlekit line, Brimfang line
  nutrition: ['02_00', '13_00'],   // Mossbud line, Bloomoo line
  mind:      ['02_06', '13_06'],   // Dewfin line, Duover line
  create:    ['17_02', '17_06'],   // Kindlekit line, Duskit line
};


const MANA_MAX_BASE = 200;

/* ---------- default state ---------- */
function defaultState() {
  return {
    v: 1,
    created: Date.now(),
    onboarded: false,
    goals: [],
    player: { level: 1, xp: 0, gold: 0, gems: 30, mana: 60, essence: 0 },
    beasts: {},          // cid -> {level, xp}
    party: [],           // [cid]
    dex: {},             // cid -> 'seen' | 'owned'
    stage: { tier: 0, area: 0, num: 1, wave: 1, farm: false }, // farm = boss failed, farming
    kills: 0,
    bossKills: 0,
    habits: {},          // hid -> {done: n, day: 'YYYY-MM-DD'}
    habitLog: {},        // day -> total habit completions (for streak)
    streak: { count: 0, lastDay: null },
    meals: [],           // today's [{name, kcal, ts}]
    mealsDay: null,
    kcalTarget: 2000,
    kcalBonusDay: null,  // last day the within-target bonus was granted for
    custom: [],          // [{id, name, icon}]
    boosts: { exerciseUntil: 0, blessingUntil: 0, hasteUntil: 0 },
    exTimer: null,       // {kind:'exercise'|'walk'|'create', mins, startedAt}
    quests: { day: null, list: [] },
    summons: { total: 0, sinceRare: 0 },
    settings: { sound: true, panels: { upgrades: false, fusion: false } },
    tutorial: {},
    lastSeen: Date.now(),
    starterCid: null,
    /* --- v3 --- */
    upgrades: { dmg: 0, spd: 0, crit: 0, gold: 0, hp: 0, ult: 0 },
    merge: {
      board: Array(12).fill(null), energy: 6, lastEnergy: Date.now(),
      shards: 0,
      /* gem-funded forge upgrades, each a level index into MERGE_UPGRADES */
      up: { slots: 0, tier: 0, luck: 0, energy: 0, rarity: 0 },
      forgeTarget: null,        // slot index being fed shards
    },
    farm: { plots: [{}, {}, {}, {}, {}, {}, {}, {}, {}], seeds: 3, food: {} },
    lab: { points: 5, serums: 0, rolls: 0 },
    login: { cycle: 0, lastDay: null },
    challenge: { day: null, idx: 0, done: false },
    /* arena: local rating, rivals added by code, tournament in progress */
    arena: { rating: 1000, wins: 0, losses: 0, rivals: [], tourney: null, day: null, fights: 0 },
    /* in-app reward offers: daily caps + tip-card cooldown */
    offers: { day: null, used: {}, lastTip: 0, insured: false },
    regionProgress: {},
    losses: 0,
    /* --- v4: the dream you are pursuing --- */
    dream: { key: null, level: 0, mins: 20, days: [1, 2, 3, 4, 5], why: '',
             minutes: 0, sessions: 0, todayMinutes: 0, lastDone: null,
             taskSkips: 0, log: [], _lastRung: 0, started: Date.now() },
    session: null,   // {mins, startedAt, paused, pausedAt, elapsedBefore}
  };
}

let S = defaultState();

/* ---------- save / load ---------- */
function save() {
  S.lastSeen = Date.now();
  try { localStorage.setItem(saveKeyFor(), JSON.stringify(S)); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(saveKeyFor());
    if (!raw) return false;
    const data = JSON.parse(raw);
    S = Object.assign(defaultState(), data);
    S.player = Object.assign(defaultState().player, data.player);
    S.settings = Object.assign(defaultState().settings, data.settings);
  S.settings.panels = Object.assign(defaultState().settings.panels, S.settings.panels);
    sanitize();
    return S.onboarded;
  } catch (e) { return false; }
}
/* drop references to creatures that no longer exist (sprite set can change) */
function sanitize() {
  for (const cid of Object.keys(S.beasts)) if (!C_BY_ID[cid]) delete S.beasts[cid];
  for (const cid of Object.keys(S.dex)) if (!C_BY_ID[cid]) delete S.dex[cid];
  S.party = S.party.filter(cid => C_BY_ID[cid] && S.beasts[cid]);
  if (!S.party.length && Object.keys(S.beasts).length) S.party = [Object.keys(S.beasts)[0]];
  if (S.starterCid && !C_BY_ID[S.starterCid]) S.starterCid = null;
  const d = defaultState();
  for (const k of ['upgrades', 'merge', 'farm', 'lab', 'login', 'challenge', 'regionProgress', 'dream', 'offers', 'arena']) {
    if (typeof S[k] !== 'object' || S[k] === null) S[k] = d[k];
  }
  if (typeof S.merge.up !== 'object' || S.merge.up === null) S.merge.up = { slots: 0, tier: 0, luck: 0, energy: 0, rarity: 0 };
  for (const k of Object.keys(MERGE_UPGRADES)) {
    S.merge.up[k] = clamp(S.merge.up[k] | 0, 0, MERGE_UPGRADES[k].max);
  }
  S.merge.shards = Math.max(0, S.merge.shards | 0);
  if (!Array.isArray(S.merge.board)) S.merge.board = [];
  // the board grows with the slots upgrade, so resize instead of resetting
  const want = mergeSlots();
  while (S.merge.board.length < want) S.merge.board.push(null);
  if (S.merge.board.length > want) {
    const spill = S.merge.board.slice(want).filter(Boolean);
    S.merge.board = S.merge.board.slice(0, want);
    for (const it of spill) {
      const i = S.merge.board.indexOf(null);
      if (i >= 0) S.merge.board[i] = it;      // never silently destroy gear
    }
  }
  S.merge.board = S.merge.board.map(it => {
    if (!it || !MERGE_CATS[it.cat]) return null;
    const n = MERGE_CATS[it.cat].variants.length;
    return { cat: it.cat, variant: clamp(it.variant | 0, 0, n - 1),
             tier: clamp(it.tier | 0, 1, mergeMaxTier()),
             r: clamp(it.r | 0, 0, GEAR_MAX_R) };
  });
  if (typeof S.merge.forgeTarget !== 'number' ||
      S.merge.forgeTarget < 0 || S.merge.forgeTarget >= want) S.merge.forgeTarget = null;
  if (!Array.isArray(S.farm.plots)) S.farm.plots = [];
  while (S.farm.plots.length < 9) S.farm.plots.push({});
  S.farm.plots = S.farm.plots.slice(0, 9);
  if (typeof S.farm.food !== 'object') S.farm.food = {};
}

function hardReset() {
  localStorage.removeItem(saveKeyFor());
  location.reload();
}

/* ---------- derived values ---------- */
function manaMax() { return MANA_MAX_BASE + (S.player.level - 1) * 10; }
/* Relics are gone. Kept as a zero so every bonus formula that referenced them
   still reads cleanly rather than being rewritten at a dozen call sites. */
function relicBonusStat() { return 0; }

function xpForLevel(lvl) { return Math.floor(90 * Math.pow(1.38, lvl - 1)); }

/* ---------- cookie-clicker battle upgrades ---------- */
/* The game opens up instead of dumping everything on a new player at once. */
const UNLOCKS = { upgrades: 3, fusion: 6 };
/* Level -> what it hands you. Drives the level-up screen, so growing is never
   just a bigger number with no explanation attached. */
const LEVEL_REWARDS = {
  3:  ['Camp upgrades unlocked', '2nd party slot'],
  4:  ['+1 gear slot in the Fusion camp'],
  6:  ['Fusion camp unlocked', '3rd party slot'],
  8:  ['+1 gear slot'],
  10: ['Support pal slot'],
  12: ['4th party slot'],
  14: ['+1 gear slot'],
  16: ['2nd support pal slot'],
};
function levelRewards(lvl) { return LEVEL_REWARDS[lvl] || []; }
function unlocked(key) { return S.player.level >= (UNLOCKS[key] || 0); }

const UPGRADE_DEFS = [
  { key: 'dmg',  name: 'Whetstone',   icon: 'sword',  per: 5, unit: '% damage',   base: 30 },
  { key: 'spd',  name: 'War Drums',   icon: 'timer',  per: 3, unit: '% atk speed', base: 45 },
  { key: 'crit', name: 'Hawk Eye',    icon: 'bolt',   per: 1, unit: '% crit',      base: 60 },
  { key: 'gold', name: 'Loot Sacks',  icon: 'gold',   per: 6, unit: '% gold',      base: 40 },
  { key: 'hp',   name: 'Camp Feast',  icon: 'hp',     per: 6, unit: '% vitality',  base: 35 },
  { key: 'ult',  name: 'War Banner',  icon: 'star',   per: 5, unit: '% ult rate',  base: 55 },
];
function upgradeCost(key) {
  const def = UPGRADE_DEFS.find(u => u.key === key);
  const lvl = S.upgrades[key] || 0;
  return Math.floor(def.base * Math.pow(1.42, lvl) * Math.pow(1.13, globalStage() * 0.35));
}
function upgradeBonus(key) {
  const def = UPGRADE_DEFS.find(u => u.key === key);
  return (S.upgrades[key] || 0) * def.per / 100;
}

/* ---------- merge board ---------- */
/* Each variant maps to one of the six drawn gear sheets, so an item on the
   board shows its actual tiered artwork rather than a generic glyph. */
const MERGE_CATS = {
  weapon: { name: 'Weapon', icon: 'sword',  stat: 'dmg',  per: 2.0,
            variants: [{ name: 'Blade', gear: 'sword' },
                       { name: 'Cleaver', gear: 'axe' },
                       { name: 'Stiletto', gear: 'dagger' }] },
  armor:  { name: 'Armor',  icon: 'shield', stat: 'hp',   per: 2.5,
            variants: [{ name: 'Helm', gear: 'helm' },
                       { name: 'Gauntlet', gear: 'gauntlet' }] },
  charm:  { name: 'Charm',  icon: 'relic',  stat: 'gold', per: 2.0,
            variants: [{ name: 'Signet', gear: 'ring' }] },
};
function mergeVariant(it) {
  const vs = MERGE_CATS[it.cat].variants;
  return vs[Math.min(it.variant, vs.length - 1)];
}
const MERGE_TIER_BASE = 9;

/* ---------- gear rarity ----------
   Rarity is rolled on spawn and multiplies the piece's whole contribution, so
   a lucky legendary tier-4 can beat an unlucky tier-6. It is also the thing
   gems and shards buy, which gives the board a progression of its own. */
const GEAR_RARITY = [
  { key: 'common',    name: 'Common',    mult: 1.0,  col: '#8f9bb8', w: 62 },
  { key: 'rare',      name: 'Rare',      mult: 1.45, col: '#45a6ff', w: 25 },
  { key: 'epic',      name: 'Epic',      mult: 2.1,  col: '#b47cff', w: 10 },
  { key: 'legendary', name: 'Legendary', mult: 3.2,  col: '#ffc247', w: 3 },
];
const GEAR_MAX_R = GEAR_RARITY.length - 1;

/* Forge upgrades bought with gems. Costs are tuned against a gem income of
   roughly 25-45/day from quests and bosses, so each step is a real goal
   rather than pocket change. */
const MERGE_UPGRADES = {
  slots:  { name: 'Board slots', icon: 'portal', max: 6, per: 1,
            note: 'One more slot to work with',
            cost: n => Math.round(55 * Math.pow(1.55, n)) },
  tier:   { name: 'Tier ceiling', icon: 'sword', max: 3, per: 1,
            note: 'Fuse one tier higher',
            cost: n => Math.round(140 * Math.pow(2.0, n)) },
  luck:   { name: 'Forge luck', icon: 'gem', max: 5, per: 1,
            note: 'Better rarity when the wheel spawns gear',
            cost: n => Math.round(45 * Math.pow(1.7, n)) },
  energy: { name: 'Wheel charge', icon: 'bolt', max: 6, per: 1,
            note: '+1 max charge, faster recharge',
            cost: n => Math.round(40 * Math.pow(1.5, n)) },
  /* the rarity ceiling. Level 0 caps gear at Rare, so Epic and Legendary are
     things you buy the right to own, not just things you wait for. */
  rarity: { name: 'Rarity ceiling', icon: 'relic', max: 2, per: 1,
            note: 'Unlock Epic, then Legendary gear',
            cost: n => Math.round(220 * Math.pow(2.4, n)) },
};
function mergeUpLevel(k) { return (S.merge.up && S.merge.up[k]) | 0; }
function mergeSlots() { return 12 + mergeUpLevel('slots'); }
/* highest rarity index the forge may produce or refine to */
function mergeMaxRarity() { return Math.min(GEAR_MAX_R, 1 + mergeUpLevel('rarity')); }
function mergeMaxTier() { return MERGE_TIER_BASE + mergeUpLevel('tier'); }
function gearRarity(it) { return GEAR_RARITY[clamp((it && it.r) | 0, 0, GEAR_MAX_R)]; }

/* A piece's stat contribution: doubles per tier, scaled by rarity. */
function gearPoints(it) {
  return Math.pow(2, it.tier - 1) * gearRarity(it).mult;
}
function mergeBonus(stat) {
  let pts = 0;
  for (const it of S.merge.board) {
    if (it && MERGE_CATS[it.cat] && MERGE_CATS[it.cat].stat === stat) pts += gearPoints(it);
  }
  const per = stat === 'hp' ? 2.5 : 2.0;
  return pts * per / 100;
}

/* ---------- farm foods ---------- */
const FOODS = {
  Fire:     { name: 'Ember Chili',   icon: 'chili',     mins: 40 },
  Water:    { name: 'Dew Berry',     icon: 'berry',     mins: 40 },
  Nature:   { name: 'Verdant Gourd', icon: 'gourd',     mins: 50 },
  Electric: { name: 'Storm Star',    icon: 'bean',      mins: 50 },
  Ice:      { name: 'Frost Bloom',   icon: 'mint',      mins: 50 },
  Earth:    { name: 'Stone Root',    icon: 'rootv',     mins: 60 },
  Shadow:   { name: 'Gloom Plum',    icon: 'gloomcap',  mins: 60 },
  Mystic:   { name: 'Star Fruit',    icon: 'starfruit', mins: 70 },
  Metal:    { name: 'Iron Nugget',   icon: 'kernel',    mins: 70 },
};
function beastXpNeed(lvl) { return 22 * Math.pow(1.3, lvl - 1); }
function grantBeastXpTo(cid, amount) {
  const inst = S.beasts[cid];
  if (!inst) return false;
  inst.xp += amount;
  let leveled = false;
  while (inst.xp >= beastXpNeed(inst.level)) {
    inst.xp -= beastXpNeed(inst.level);
    inst.level++;
    leveled = true;
  }
  return leveled;
}

function partySlots() {
  const l = S.player.level;
  return l >= 12 ? 4 : l >= 6 ? 3 : l >= 3 ? 2 : 1;
}

function beastStats(cid) {
  const c = C_BY_ID[cid];
  const inst = S.beasts[cid];
  const lvl = inst ? inst.level : 1;
  const g = 1 + 0.18 * (lvl - 1);
  const mut = (inst && inst.mut) || {};
  return {
    lvl,
    hp: Math.floor(c.base.hp * g * (1 + relicBonusStat('hp') + Lore.passiveBonus('hp')
        + upgradeBonus('hp') + mergeBonus('hp') + (mut.hp || 0) / 100)),
    atk: Math.floor(c.base.atk * g * (1 + Lore.passiveBonus('atk')
        + (mut.atk || 0) / 100 + (S.lab.serums || 0) * 0.01)),
    de: Math.floor(c.base.de * g),
    spd: Math.floor(c.base.spd * (1 + 0.02 * (lvl - 1) + (mut.spd || 0) / 100)),
  };
}

function levelUpCost(cid) {
  const inst = S.beasts[cid];
  const c = C_BY_ID[cid];
  const r = RARITY_MULT[c.rarity];
  return Math.floor(14 * Math.pow(1.24, inst.level - 1) * r);
}

function evolveReq(cid) {
  const c = C_BY_ID[cid];
  if (!c.evoTo) return null;
  const lvlReq = c.stage === 1 ? 10 : 20;
  const essReq = c.stage === 1 ? 25 : 70;
  return { lvlReq, essReq, to: c.evoTo };
}

/* global stage number, 1-based, across tiers/areas */
function globalStage() {
  return S.stage.tier * AREAS.length * STAGES_PER_AREA
       + S.stage.area * STAGES_PER_AREA + S.stage.num;
}
function stageLabel() {
  const tierTag = S.stage.tier > 0 ? ` +${S.stage.tier + 1}` : '';
  return `Stage ${S.stage.area + 1}-${S.stage.num}${tierTag}`;
}

/* ---------- resource grants ---------- */
function grantGold(n, sourceEl) {
  n = Math.floor(n * (1 + relicBonusStat('gold') + Lore.passiveBonus('gold') + upgradeBonus('gold') + mergeBonus('gold')) * (isBlessed() ? 1.15 : 1));
  S.player.gold += n;
  if (sourceEl) coinBurst(sourceEl, 4);
  return n;
}
function grantMana(n) {
  n = Math.floor(n * (1 + relicBonusStat('mana') + Lore.passiveBonus('mana')));
  S.player.mana = Math.min(manaMax(), S.player.mana + n);
  return n;
}
function grantEssence(n) {
  n = Math.floor(n * (1 + relicBonusStat('ess') + Lore.passiveBonus('ess')));
  S.player.essence += n;
  return n;
}
function grantGems(n) { S.player.gems += n; return n; }
/* The Lab is gone. Everything that used to award lab points now pays gems, so
   no reward path silently drops its payout. */
function grantLabPoints(n) { return grantGems(n); }
function grantSeeds(n) { S.farm.seeds += n; return n; }

function grantPlayerXp(n) {
  n = Math.floor(n * (1 + relicBonusStat('xp') + Lore.passiveBonus('xp')) * (isBlessed() ? 1.15 : 1));
  S.player.xp += n;
  let leveled = false;
  while (S.player.xp >= xpForLevel(S.player.level)) {
    S.player.xp -= xpForLevel(S.player.level);
    S.player.level++;
    leveled = true;
  }
  if (leveled) {
    Sound.levelup();
    confetti(34);
    if (typeof UI !== 'undefined') {
      UI.renderAll();
      UI.showLevelUp(S.player.level);          // says what the level actually gave you
    } else {
      showLevelUpFlash(S.player.level);
    }
  } else if (n > 0 && typeof UI !== 'undefined') {
    UI.floatXp(n);
  }
  return n;
}

function showLevelUpFlash(lvl) {
  let f = $('#levelup-flash');
  if (!f) { f = el('div'); f.id = 'levelup-flash'; document.body.appendChild(f); }
  f.innerHTML = `<div class="ring">LEVEL ${lvl}!</div>`;
  setTimeout(() => { f.innerHTML = ''; }, 1700);
}

/* beast xp from battles */
function grantBeastXp(n) {
  const per = Math.max(1, Math.floor(n / Math.max(1, S.party.length)));
  for (const cid of S.party) {
    const inst = S.beasts[cid];
    if (!inst) continue;
    inst.xp += per;
    const need = 22 * Math.pow(1.3, inst.level - 1);
    // battle xp levels beasts slowly (gold levels them faster)
    if (inst.xp >= need) {
      inst.xp -= need;
      inst.level++;
      toast(`${C_BY_ID[cid].name} reached Lv.${inst.level}!`, 'good');
      Sound.kill();
    }
  }
}

/* ---------- boosts ---------- */
function isExerciseBoost() { return Date.now() < S.boosts.exerciseUntil; }
/* Haste: combat runs slowly by default, and gems buy five minutes of triple
   speed for when you want to push a stage now rather than idle through it. */
const HASTE_MS = 5 * 60 * 1000;
const HASTE_COST = 25;
function isHasted() { return Date.now() < (S.boosts.hasteUntil || 0); }
function hasteLeft() { return Math.max(0, (S.boosts.hasteUntil || 0) - Date.now()); }
function buyHaste() {
  if (S.player.gems < HASTE_COST) { toast(`Need ${HASTE_COST} gems`); return false; }
  S.player.gems -= HASTE_COST;
  // buying again while it runs extends rather than restarts
  S.boosts.hasteUntil = Math.max(Date.now(), S.boosts.hasteUntil || 0) + HASTE_MS;
  Sound.levelup();
  toast('Haste — combat runs 3x for 5 minutes', 'gold');
  save();
  UI.renderHud();
  UI.renderBoost();
  return true;
}
function isBlessed() { return Date.now() < S.boosts.blessingUntil; }
function rewardMult() { return isExerciseBoost() ? 3 : 1; }

/* ---------- ownership ---------- */
function ownBeast(cid) {
  if (S.beasts[cid]) return false;
  S.beasts[cid] = { level: 1, xp: 0 };
  S.dex[cid] = 'owned';
  if (S.party.length < partySlots()) S.party.push(cid);
  return true;
}
function seeCreature(cid) {
  if (!S.dex[cid]) S.dex[cid] = 'seen';
}

/* ---------- streak / daily ---------- */
function bumpStreakToday() {
  const today = todayStr();
  S.habitLog[today] = (S.habitLog[today] || 0) + 1;
  if (S.streak.lastDay === today) return;
  const yesterday = todayStr(-1);
  if (S.streak.lastDay === yesterday) S.streak.count++;
  else S.streak.count = 1;
  S.streak.lastDay = today;
}
function streakMult() {
  return 1 + Math.min(0.5, Math.max(0, S.streak.count - 1) * 0.05);
}
