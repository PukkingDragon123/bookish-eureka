/* ============ Ritual Beasts — merge board ============
   A mobile-merge mini-economy under the battle scene. The portal spawns tier-1
   gear; drag (or tap-tap) two identical items together to fuse them a tier up.
   Every item on the board feeds the party passively:
     weapons -> damage, armor -> vitality, charms -> gold find.               */
'use strict';

const Merge = (() => {
  const ENERGY_MAX = 6;
  const ENERGY_MS = 40 * 1000;          // one portal charge per 40s

  function regen() {
    const m = S.merge;
    const gained = Math.floor((Date.now() - m.lastEnergy) / ENERGY_MS);
    if (gained > 0) {
      m.energy = Math.min(ENERGY_MAX, m.energy + gained);
      m.lastEnergy += gained * ENERGY_MS;
      if (m.energy >= ENERGY_MAX) m.lastEnergy = Date.now();
    }
  }

  function freeSlot() {
    const i = S.merge.board.findIndex(x => x === null);
    return i;
  }

  function spawn(payGold) {
    regen();
    const slot = freeSlot();
    if (slot < 0) { toast('Board is full — merge something!'); return false; }
    if (payGold) {
      const cost = spawnGoldCost();
      if (S.player.gold < cost) { toast('Not enough gold'); return false; }
      S.player.gold -= cost;
    } else {
      if (S.merge.energy <= 0) { toast('Portal recharging…'); return false; }
      if (S.merge.energy === ENERGY_MAX) S.merge.lastEnergy = Date.now();
      S.merge.energy--;
    }
    const cats = Object.keys(MERGE_CATS);
    const cat = pick(cats);
    const variant = irnd(0, MERGE_CATS[cat].variants.length - 1);
    // small chance the portal spits out tier 2
    const tier = Math.random() < 0.08 ? 2 : 1;
    S.merge.board[slot] = { cat, variant, tier };
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
           a.tier === b.tier && a.tier < MERGE_MAX_TIER;
  }

  /* move item from slot a onto slot b: merge if it matches, else swap */
  function drop(a, b) {
    if (a === b) return;
    const A = S.merge.board[a], B = S.merge.board[b];
    if (!A) return;
    if (canMerge(A, B)) {
      S.merge.board[b] = { cat: A.cat, variant: A.variant, tier: A.tier + 1 };
      S.merge.board[a] = null;
      Sound.quest();
      UI.mergeFuseFx(b, A.tier + 1);
      Quests.progress('merge', 1);
      if (A.tier + 1 >= 4) grantLabPoints(A.tier - 2);   // high fusions feed the Lab
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

  function itemName(it) {
    return `${MERGE_CATS[it.cat].variants[it.variant]} T${it.tier}`;
  }

  function totals() {
    const t = { dmg: 0, hp: 0, gold: 0 };
    for (const it of S.merge.board) {
      if (!it) continue;
      const cat = MERGE_CATS[it.cat];
      t[cat.stat] += Math.pow(2, it.tier - 1) * cat.per;
    }
    return t;
  }

  return { spawn, drop, regen, canMerge, itemName, totals, spawnGoldCost,
           ENERGY_MAX, ENERGY_MS };
})();
