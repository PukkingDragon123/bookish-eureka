/* ============ the Forge — merge board ============
   A mobile-merge economy under the battle scene. The wheel spawns tier-1 gear;
   drag (or tap-tap) two matching pieces together to fuse them a tier up.
   Every piece on the board feeds the party passively:
     weapons -> damage, armor -> vitality, charms -> gold find.

   Three things make it a progression rather than a chore:
     * rarity, rolled on spawn, multiplies a piece's whole contribution
     * gems buy board slots, a higher tier ceiling, spawn luck and wheel charge
     * scrapping junk yields shards, and shards push a chosen piece's tier or
       rarity — so a board full of dead commons is still worth something.     */
'use strict';

const Merge = (() => {
  function energyMax() { return 6 + mergeUpLevel('energy'); }
  function energyMs() { return Math.round(40000 * Math.pow(0.9, mergeUpLevel('energy'))); }

  function regen() {
    const m = S.merge;
    const per = energyMs();
    const gained = Math.floor((Date.now() - m.lastEnergy) / per);
    if (gained > 0) {
      m.energy = Math.min(energyMax(), m.energy + gained);
      m.lastEnergy += gained * per;
      if (m.energy >= energyMax()) m.lastEnergy = Date.now();
    }
  }

  function freeSlot() { return S.merge.board.findIndex(x => x === null); }

  /* rarity roll — forge luck shifts weight off common and onto the top end */
  function rollRarity() {
    const lk = mergeUpLevel('luck');
    const cap = mergeMaxRarity();
    const w = GEAR_RARITY.map((r, i) => {
      if (i > cap) return 0;                 // above the purchased ceiling
      if (i === 0) return Math.max(8, r.w - lk * 9);
      return r.w * (1 + lk * (0.18 + i * 0.1));
    });
    let total = 0;
    for (const x of w) total += x;
    let roll = Math.random() * total;
    for (let i = 0; i < w.length; i++) {
      roll -= w[i];
      if (roll <= 0) return i;
    }
    return 0;
  }

  function spawn(payGold) {
    regen();
    const slot = freeSlot();
    if (slot < 0) { toast('Board is full — merge or scrap something'); return false; }
    if (payGold) {
      const cost = spawnGoldCost();
      if (S.player.gold < cost) { toast('Not enough gold'); return false; }
      S.player.gold -= cost;
    } else {
      if (S.merge.energy <= 0) { toast('Wheel is recharging'); return false; }
      if (S.merge.energy === energyMax()) S.merge.lastEnergy = Date.now();
      S.merge.energy--;
    }
    // pick uniformly across the six gear types, not across the three
    // categories — otherwise the single-variant charm shows up far too often
    const flat = [];
    for (const c of Object.keys(MERGE_CATS)) {
      MERGE_CATS[c].variants.forEach((_, i) => flat.push([c, i]));
    }
    const [cat, variant] = pick(flat);
    const tier = Math.random() < 0.08 ? 2 : 1;
    S.merge.board[slot] = { cat, variant, tier, r: rollRarity() };
    Sound.click();
    UI.renderMerge();
    UI.mergeSpawnFx(slot);
    save();
    return true;
  }

  function spawnGoldCost() {
    return Math.floor(25 * Math.pow(1.18, globalStage() * 0.5));
  }

  function canMerge(a, b) {
    return a && b && a.cat === b.cat && a.variant === b.variant &&
           a.tier === b.tier && a.tier < mergeMaxTier();
  }

  /* move item from slot a onto slot b: merge if it matches, else swap */
  function drop(a, b) {
    if (a === b) return;
    const A = S.merge.board[a], B = S.merge.board[b];
    if (!A) return;
    if (canMerge(A, B)) {
      // the fused piece keeps the better rarity, and matching rarities have a
      // real chance to step up — so merging like with like is rewarded
      let r = Math.max(A.r | 0, B.r | 0);
      const bumped = (A.r | 0) === (B.r | 0) && r < mergeMaxRarity() &&
        Math.random() < 0.16 + mergeUpLevel('luck') * 0.03;
      if (bumped) r++;
      S.merge.board[b] = { cat: A.cat, variant: A.variant, tier: A.tier + 1, r };
      S.merge.board[a] = null;
      Sound.quest();
      UI.mergeFuseFx(b, A.tier + 1, bumped);
      Quests.progress('merge', 1);
      if (bumped) toast(`Rarity up — ${GEAR_RARITY[r].name}!`, 'gold');
    } else if (!B) {
      S.merge.board[b] = A;
      S.merge.board[a] = null;
      Sound.click();
    } else {
      S.merge.board[a] = B;
      S.merge.board[b] = A;
      Sound.click();
    }
    UI.renderMerge();
    save();
  }

  /* ---------------- gem upgrades ---------------- */
  function upCost(k) {
    const u = MERGE_UPGRADES[k];
    const lv = mergeUpLevel(k);
    return lv >= u.max ? null : u.cost(lv);
  }

  function buyUpgrade(k) {
    const u = MERGE_UPGRADES[k];
    if (!u) return false;
    const cost = upCost(k);
    if (cost === null) { toast('Already maxed'); return false; }
    if (S.player.gems < cost) { toast(`Need ${cost} gems`); return false; }
    S.player.gems -= cost;
    S.merge.up[k] = mergeUpLevel(k) + 1;
    if (k === 'slots') S.merge.board.push(null);
    if (k === 'energy') S.merge.energy = Math.min(energyMax(), S.merge.energy + 1);
    Sound.levelup();
    toast(`${u.name} → ${mergeUpLevel(k)}`, 'gold');
    save();
    UI.renderMerge();
    UI.renderHud();
    return true;
  }

  /* ---------------- shards: scrap, then spend ---------------- */
  function scrapValue(it) {
    return Math.max(1, Math.round(Math.pow(2, it.tier - 1) * gearRarity(it).mult));
  }

  function scrap(slot) {
    const it = S.merge.board[slot];
    if (!it) return false;
    const got = scrapValue(it);
    S.merge.shards += got;
    S.merge.board[slot] = null;
    if (S.merge.forgeTarget === slot) S.merge.forgeTarget = null;
    Sound.click();
    toast(`Scrapped ${itemName(it)} → +${got} shards`);
    save();
    UI.renderMerge();
    return true;
  }

  /* pushing a piece costs shards that scale with what it already is, so
     shards accelerate a build instead of replacing the merging entirely */
  function tierCost(it) { return Math.round(6 * Math.pow(1.9, it.tier - 1)); }
  function rarityCost(it) { return Math.round(14 * Math.pow(2.4, (it.r | 0))); }

  function forgeTier(slot) {
    const it = S.merge.board[slot];
    if (!it) return false;
    if (it.tier >= mergeMaxTier()) { toast('Tier ceiling — upgrade it with gems'); return false; }
    const cost = tierCost(it);
    if (S.merge.shards < cost) { toast(`Need ${cost} shards`); return false; }
    S.merge.shards -= cost;
    it.tier++;
    Sound.quest();
    UI.mergeFuseFx(slot, it.tier, false);
    save();
    UI.renderMerge();
    return true;
  }

  function forgeRarity(slot) {
    const it = S.merge.board[slot];
    if (!it) return false;
    if ((it.r | 0) >= mergeMaxRarity()) {
      toast((it.r | 0) >= GEAR_MAX_R ? 'Already legendary'
        : `Rarity ceiling — raise it with gems`);
      return false;
    }
    const cost = rarityCost(it);
    if (S.merge.shards < cost) { toast(`Need ${cost} shards`); return false; }
    S.merge.shards -= cost;
    it.r = (it.r | 0) + 1;
    Sound.levelup();
    toast(`${mergeVariant(it).name} T${it.tier} → ${gearRarity(it).name}`, 'gold');
    UI.mergeFuseFx(slot, it.tier, true);
    save();
    UI.renderMerge();
    return true;
  }

  function itemName(it) {
    return `${gearRarity(it).name} ${mergeVariant(it).name} T${it.tier}`;
  }

  function totals() {
    const t = { dmg: 0, hp: 0, gold: 0 };
    for (const it of S.merge.board) {
      if (!it) continue;
      const cat = MERGE_CATS[it.cat];
      t[cat.stat] += gearPoints(it) * cat.per;
    }
    return t;
  }

  /* board power, so the panel can show one honest number */
  function boardPower() {
    let p = 0;
    for (const it of S.merge.board) if (it) p += gearPoints(it);
    return Math.round(p);
  }

  return { spawn, drop, regen, canMerge, itemName, totals, spawnGoldCost,
           buyUpgrade, upCost, scrap, scrapValue, forgeTier, forgeRarity,
           tierCost, rarityCost, boardPower, energyMax, energyMs };
})();
