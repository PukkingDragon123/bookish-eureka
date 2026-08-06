/* ============ Hourling — summon banners v4 ============
   Seven banners: the mana-fed Wild Circle, a daily element banner, the gem
   Radiant banner, a cheap Novice circle biased toward beasts you lack, a
   weekly two-element banner, the high-roll Ascendant banner, and a Harvest
   circle paid for with duplicate essence.
   Single pulls and discounted 10-pulls, with a rune-circle wish animation. */
'use strict';

const Summon = (() => {
  const RELIC_CHANCE = 0.10;
  const PITY_EVERY = 10;

  const ELEMENT_CYCLE = ['Fire', 'Water', 'Nature', 'Electric', 'Ice', 'Earth', 'Shadow', 'Mystic', 'Metal'];

  function todaysElement() {
    const day = Math.floor(Date.now() / 86400000);
    return ELEMENT_CYCLE[day % ELEMENT_CYCLE.length];
  }

  /* the two elements the weekly duo banner favours */
  function weeksElements() {
    const wk = Math.floor(Date.now() / (86400000 * 7));
    const a = ELEMENT_CYCLE[wk % ELEMENT_CYCLE.length];
    const b = ELEMENT_CYCLE[(wk * 4 + 3) % ELEMENT_CYCLE.length];
    return a === b ? [a, ELEMENT_CYCLE[(wk + 1) % ELEMENT_CYCLE.length]] : [a, b];
  }

  function banners() {
    const elem = todaysElement();
    const duo = weeksElements();
    return [
      { id: 'wild', name: 'Wild Circle', sub: 'mana from your real-life quests',
        cost: 40, cur: 'mana', icon: 'mana', elem: null,
        weights: RARITY_W },
      { id: 'element', name: elem + ' Banner', sub: `70% ${elem}-type · rotates daily`,
        cost: 22, cur: 'gems', icon: null, elem,
        weights: { common: 40, uncommon: 32, rare: 20, epic: 6.6, legendary: 1.4 } },
      { id: 'radiant', name: 'Radiant Banner', sub: 'boosted rare & epic rates',
        cost: 30, cur: 'gems', icon: 'gem', elem: null,
        weights: RARITY_W_GEM },
      { id: 'novice', name: 'Novice Circle', sub: 'cheap pulls · great for filling the dex',
        cost: 10, cur: 'gems', icon: 'book', elem: null, newBias: true,
        weights: { common: 62, uncommon: 27, rare: 9, epic: 1.8, legendary: 0.2 } },
      { id: 'duo', name: duo[0] + ' & ' + duo[1], sub: 'two types rate-up · rotates weekly',
        cost: 26, cur: 'gems', icon: null, elems: duo,
        weights: { common: 34, uncommon: 33, rare: 24, epic: 7.4, legendary: 1.6 } },
      { id: 'ascend', name: 'Ascendant Banner', sub: 'the best legendary odds in the game',
        cost: 65, cur: 'gems', icon: 'portal', elem: null,
        weights: { common: 0, uncommon: 16, rare: 44, epic: 30, legendary: 10 } },
      { id: 'harvest', name: 'Harvest Circle', sub: 'spend essence from duplicates',
        cost: 55, cur: 'essence', icon: 'essence', elem: null,
        weights: { common: 30, uncommon: 34, rare: 26, epic: 8.4, legendary: 1.6 } },
    ];
  }

  function poolFor(banner) {
    const els = banner.elems || (banner.elem ? [banner.elem] : null);
    if (!els) return SUMMON_POOL;
    const p = SUMMON_POOL.filter(c => els.some(e => c.types.includes(e)));
    return p.length >= 5 ? p : SUMMON_POOL;
  }

  function pickCreature(banner) {
    let w = banner.weights;
    if (S.summons.sinceRare >= PITY_EVERY - 1) {
      w = { common: 0, uncommon: 0, rare: 70, epic: 24, legendary: 6 };
    }
    let pool = SUMMON_POOL;
    if ((banner.elem || banner.elems) && Math.random() < 0.7) pool = poolFor(banner);
    // the novice banner leans toward beasts you have not collected yet
    if (banner.newBias) {
      const fresh = pool.filter(x => !S.beasts[x.id]);
      if (fresh.length >= 3 && Math.random() < 0.7) pool = fresh;
    }
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
    } else if (banner.cur === 'essence') {
      if (S.player.essence < cost) { toast('Not enough essence — duplicates give it'); return false; }
      S.player.essence -= cost;
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
