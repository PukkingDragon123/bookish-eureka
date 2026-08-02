/* ============ Ritual Beasts — the farm ============
   Six plots grow element foods in real time. Seeds come from logging real
   meals (detail pays: calories +1, photo +1). Finishing any quest or work
   timer waters the whole field, cutting the remaining grow time.
   Food is what levels beasts: feeding matches their element for double XP. */
'use strict';

const Farm = (() => {

  function growMs(el) { return FOODS[el].mins * 60 * 1000; }

  function plant(i, element) {
    const p = S.farm.plots[i];
    if (p.el) { toast('Something is already growing there'); return false; }
    if (S.farm.seeds <= 0) { toast('No seeds — log a real meal to earn some!'); return false; }
    S.farm.seeds--;
    S.farm.plots[i] = { el: element, at: Date.now(), boost: 0 };
    Sound.click();
    save();
    UI.renderFarm();
    return true;
  }

  function remaining(p) {
    if (!p.el) return 0;
    return Math.max(0, p.at + growMs(p.el) - (p.boost || 0) - Date.now());
  }
  function ready(p) { return p.el && remaining(p) <= 0; }

  function harvest(i, btnEl) {
    const p = S.farm.plots[i];
    if (!ready(p)) return;
    const el = p.el;
    const n = irnd(2, 3);
    S.farm.food[el] = (S.farm.food[el] || 0) + n;
    S.farm.plots[i] = {};
    Sound.coin();
    if (btnEl) coinBurst(btnEl, 3);
    toast(`Harvested ${n} ${FOODS[el].name}!`, 'good');
    Quests.progress('harvest', n);
    save();
    UI.renderFarm();
    UI.renderHud();
  }

  /* every completed quest / work timer waters the field */
  function waterAll(mins) {
    let any = false;
    for (const p of S.farm.plots) {
      if (p.el) { p.boost = (p.boost || 0) + mins * 60 * 1000; any = true; }
    }
    if (any) toast(`Your field drinks it in — crops sped up ${mins} min!`, 'good');
    save();
  }

  function feed(cid, el, fromEl) {
    const have = S.farm.food[el] || 0;
    if (have <= 0) { toast('None of that food left'); return false; }
    const inst = S.beasts[cid];
    if (!inst) return false;
    S.farm.food[el] = have - 1;
    const c = C_BY_ID[cid];
    const match = c.types.includes(el);
    const xp = Math.round(beastXpNeed(inst.level) * (match ? 0.6 : 0.25));
    const before = inst.level;
    const leveled = grantBeastXpTo(cid, xp);
    Sound.habit();
    if (fromEl) {
      const r = fromEl.getBoundingClientRect();
      const f = el2fly(match ? `+${xp} XP! Yum!` : `+${xp} XP`, r);
      if (match) confetti(14);
    }
    if (leveled) {
      toast(`${c.name} grew to Lv.${inst.level}!`, 'gold');
      Sound.levelup();
      const kit = Lore.kit(cid);
      const unlocked = kit.passives.find(p => p.level > before && p.level <= inst.level);
      if (unlocked) toast(`${c.name} unlocked ${unlocked.name}!`, 'good');
    }
    Quests.progress('feed', 1);
    save();
    return true;
  }

  function el2fly(txt, r) {
    const f = el('div', 'dmg-float heal', txt);
    f.style.position = 'fixed';
    f.style.left = (r.left + r.width / 2 - 20) + 'px';
    f.style.top = (r.top - 10) + 'px';
    f.style.zIndex = 300;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1300);
    return f;
  }

  function totalFood() {
    return Object.values(S.farm.food).reduce((a, b) => a + b, 0);
  }

  return { plant, harvest, remaining, ready, waterAll, feed, totalFood, growMs };
})();
