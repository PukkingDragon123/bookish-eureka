/* ============ Ritual Beasts — summon banners v3 ============
   Three banners: the mana-fed Wild Circle, a daily rotating element banner
   with a 70% rate-up, and the gem Radiant banner with boosted rarities.
   Single pulls and discounted 10-pulls, with a comet wish animation.        */
'use strict';

const Summon = (() => {
  const RELIC_CHANCE = 0.10;
  const PITY_EVERY = 10;

  const ELEMENT_CYCLE = ['Fire', 'Water', 'Nature', 'Electric', 'Ice', 'Earth', 'Shadow', 'Mystic', 'Metal'];

  function todaysElement() {
    const day = Math.floor(Date.now() / 86400000);
    return ELEMENT_CYCLE[day % ELEMENT_CYCLE.length];
  }

  function banners() {
    const elem = todaysElement();
    return [
      { id: 'wild', name: 'Wild Circle', sub: 'mana from your real-life quests',
        cost: 40, cur: 'mana', icon: 'mana', elem: null,
        weights: RARITY_W },
      { id: 'element', name: elem + ' Banner', sub: `70% ${elem}-type · rotates daily`,
        cost: 22, cur: 'gems', icon: TYPE_ICONS[elem], elem,
        weights: { common: 40, uncommon: 32, rare: 20, epic: 6.6, legendary: 1.4 } },
      { id: 'radiant', name: 'Radiant Banner', sub: 'boosted rare & epic rates',
        cost: 30, cur: 'gems', icon: 'gem', elem: null,
        weights: RARITY_W_GEM },
    ];
  }

  function poolFor(banner) {
    if (!banner.elem) return SUMMON_POOL;
    const p = SUMMON_POOL.filter(c => c.types.includes(banner.elem));
    return p.length >= 5 ? p : SUMMON_POOL;
  }

  function pickCreature(banner) {
    let w = banner.weights;
    if (S.summons.sinceRare >= PITY_EVERY - 1) {
      w = { common: 0, uncommon: 0, rare: 70, epic: 24, legendary: 6 };
    }
    let pool = SUMMON_POOL;
    if (banner.elem && Math.random() < 0.7) pool = poolFor(banner);
    const c = weightedPick(pool, x => w[x.rarity] || 0.1);
    const isRarePlus = RARITY_ORDER.indexOf(c.rarity) >= 2;
    S.summons.sinceRare = isRarePlus ? 0 : S.summons.sinceRare + 1;
    return c;
  }

  function pay(banner, pulls) {
    const cost = banner.cost * (pulls === 10 ? 9 : 1);
    if (banner.cur === 'mana') {
      if (S.player.mana < cost) { toast('Not enough mana — go do a daily quest!'); return false; }
      S.player.mana -= cost;
    } else {
      if (S.player.gems < cost) { toast('Not enough gems'); return false; }
      S.player.gems -= cost;
    }
    return true;
  }

  function doSummon(bannerId, pulls) {
    pulls = pulls || 1;
    const banner = banners().find(b => b.id === bannerId);
    if (!banner || !pay(banner, pulls)) return;

    const results = [];
    let guaranteedRare = pulls === 10;
    for (let i = 0; i < pulls; i++) {
      S.summons.total++;
      // relics only drop on single wild pulls, and never eat a 10-pull slot
      if (pulls === 1 && Math.random() < RELIC_CHANCE) {
        const r = pick(RELICS);
        S.relics[r.id] = (S.relics[r.id] || 0) + 1;
        results.push({ relic: r });
        continue;
      }
      let c = pickCreature(banner);
      if (guaranteedRare && i === pulls - 1 &&
          !results.some(x => x.c && RARITY_ORDER.indexOf(x.c.rarity) >= 2) &&
          RARITY_ORDER.indexOf(c.rarity) < 2) {
        const pool = poolFor(banner).filter(x => RARITY_ORDER.indexOf(x.rarity) >= 2);
        c = pick(pool.length ? pool : SUMMON_POOL.filter(x => x.rarity === 'rare'));
        S.summons.sinceRare = 0;
      }
      const isNew = ownBeast(c.id);
      let dup = null;
      if (!isNew) {
        const ess = grantEssence(3 * (RARITY_ORDER.indexOf(c.rarity) + 1));
        S.beasts[c.id].level++;
        dup = { ess, level: S.beasts[c.id].level };
      }
      results.push({ c, isNew, dup });
    }
    Quests.progress('summon', pulls);
    Sound.summon();
    save();
    UI.renderHud();
    UI.renderSummon();
    UI.playWish(banner, results);
  }

  return { doSummon, banners, todaysElement, PITY_EVERY };
})();
