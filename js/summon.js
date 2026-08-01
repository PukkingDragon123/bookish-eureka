/* ============ Ritual Beasts — summoning (mana/gem gacha) ============ */
'use strict';

const Summon = (() => {
  const MANA_COST = 40;
  const GEM_COST = 30;
  const RELIC_CHANCE = 0.11;
  const PITY_EVERY = 10;

  function pickCreature(weights) {
    // pity: guarantee rare+ every PITY_EVERY wild summons
    let w = weights;
    if (S.summons.sinceRare >= PITY_EVERY - 1) {
      w = { common: 0, uncommon: 0, rare: 70, epic: 24, legendary: 6 };
    }
    const c = weightedPick(SUMMON_POOL, x => w[x.rarity] || 0.1);
    return c;
  }

  function doSummon(useGems) {
    const cost = useGems ? GEM_COST : MANA_COST;
    if (useGems) {
      if (S.player.gems < cost) { toast('Not enough gems'); return; }
      S.player.gems -= cost;
    } else {
      if (S.player.mana < cost) { toast('Not enough mana — go do a ritual!'); return; }
      S.player.mana -= cost;
    }
    S.summons.total++;
    Quests.progress('summon', 1);
    Sound.summon();

    // relic roll (items!)
    if (Math.random() < RELIC_CHANCE) {
      const r = pick(RELICS);
      S.relics[r.id] = (S.relics[r.id] || 0) + 1;
      save();
      UI.renderHud();
      UI.renderSummon();
      UI.showRelicReveal(r);
      return;
    }

    const c = pickCreature(useGems ? RARITY_W_GEM : RARITY_W);
    const isRarePlus = RARITY_ORDER.indexOf(c.rarity) >= 2;
    if (!useGems) S.summons.sinceRare = isRarePlus ? 0 : S.summons.sinceRare + 1;

    const isNew = ownBeast(c.id);
    let dupBonus = null;
    if (!isNew) {
      // duplicate: essence + a free level
      const ess = grantEssence(3 * (RARITY_ORDER.indexOf(c.rarity) + 1));
      S.beasts[c.id].level++;
      dupBonus = { ess, level: S.beasts[c.id].level };
    }
    save();
    UI.renderHud();
    UI.renderSummon();
    UI.showSummonReveal(c, isNew, dupBonus);
  }

  return { doSummon, MANA_COST, GEM_COST, PITY_EVERY };
})();
