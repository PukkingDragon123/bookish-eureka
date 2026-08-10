/* ============ Offers — the free-reward slot ============
   This is the "watch an ad for currency" loop that mobile games run, done
   plainly. There is no ad network here and nothing is sold: every offer is
   served by the app itself and every one of them asks for either fifteen
   seconds of attention on a real practice tip, or a small real-life action.
   Nothing here impersonates a third-party advert, and no offer takes money.

   If this ever ships with real rewarded video, the shape already fits: the
   claim() call is where an SDK's reward callback would go.               */
'use strict';

const Offers = (() => {
  const CARD_MS = 15000;          // one tip card runs fifteen seconds
  const TIP_GAP_MS = 8 * 60 * 1000;

  /* Short, concrete practice tips. Deliberately plain — they are advice, not
     marketing copy, and they are the actual thing you are "watching". */
  const TIPS = [
    ['Start absurdly small', 'A two-minute version of your session still counts. Momentum beats intensity, every week.'],
    ['Put the reps first', 'Do the thing before you tidy, plan or research it. Preparation is the most comfortable way to avoid practice.'],
    ['One target per session', 'Name the single thing you are trying to improve before you start. "Practise" is not a target.'],
    ['Slow is a technique', 'Play, speak or move it at half speed until it is clean. Speed added to sloppy is just faster sloppy.'],
    ['Stop while it still works', 'End the session with something going well. You will come back to it more willingly tomorrow.'],
    ['Record yourself once a week', 'You cannot fix what you cannot hear or see. A phone recording is the cheapest coach you have.'],
    ['Miss once, never twice', 'One skipped day is noise. Two in a row is the start of a new habit. Protect the second day.'],
    ['Make it obvious', 'Leave the instrument, shoes or notebook where you will trip over them. Friction decides more than motivation.'],
    ['Log the minutes, not the mood', 'Some sessions feel terrible and still build skill. Count what you did, not how it felt.'],
    ['Sleep is practice', 'Skill consolidates overnight. A late night costs you part of the session you already did.'],
    ['Work at the edge', 'If you never fumble, it is too easy. Sit just past comfortable, where mistakes are frequent but recoverable.'],
    ['Review before you add', 'Spend the first five minutes on last session\'s weak spot before learning anything new.'],
  ];

  const OFFERS = {
    tip: {
      name: 'Practice tip', icon: 'book', cap: 3,
      blurb: '15 seconds, one real tip',
      reward: () => {
        const g = grantGems(5), gold = grantGold(120 * Math.pow(1.15, globalStage()));
        return `+5 gems · +${fmt(gold)} gold`;
      },
    },
    double: {
      name: 'Double today\'s haul', icon: 'chest', cap: 1,
      blurb: 'Watch a tip, then take double mana and gold',
      reward: () => {
        const mana = grantMana(60), gold = grantGold(400 * Math.pow(1.15, globalStage()));
        return `+${mana} mana · +${fmt(gold)} gold`;
      },
    },
    reflect: {
      name: 'Write today down', icon: 'scroll', cap: 1,
      blurb: 'One line about how practice went',
      reward: () => `+8 gems`,          // granted after the write, in submit()
    },
  };

  function today() { return todayStr(); }

  function st() {
    if (!S.offers || typeof S.offers !== 'object') {
      S.offers = { day: today(), used: {}, lastTip: 0, insured: false };
    }
    if (S.offers.day !== today()) {
      S.offers.day = today();
      S.offers.used = {};
      S.offers.insured = false;
    }
    if (typeof S.offers.used !== 'object' || S.offers.used === null) S.offers.used = {};
    return S.offers;
  }

  function usedToday(k) { return st().used[k] | 0; }
  function left(k) { return Math.max(0, (OFFERS[k] ? OFFERS[k].cap : 0) - usedToday(k)); }
  function cooling() { return Math.max(0, TIP_GAP_MS - (Date.now() - (st().lastTip || 0))); }

  function available(k) {
    if (!OFFERS[k]) return false;
    if (left(k) <= 0) return false;
    if (k !== 'reflect' && cooling() > 0) return false;
    return true;
  }

  /* how many offers are claimable right now — drives the HUD badge */
  function readyCount() { return Object.keys(OFFERS).filter(available).length; }

  function pickTip() { return pick(TIPS); }

  /* Runs the fifteen-second card, then pays out. UI owns the presentation;
     this owns the rules. */
  function start(k) {
    if (!available(k)) {
      const c = cooling();
      if (c > 0 && k !== 'reflect') toast(`Next tip in ${fmtTime(c / 1000)}`);
      else toast('Come back tomorrow for this one');
      return false;
    }
    if (k === 'reflect') { UI.showReflectOffer(); return true; }
    UI.showTipCard(k, pickTip(), CARD_MS, () => claim(k));
    return true;
  }

  function claim(k) {
    if (!OFFERS[k]) return;
    const o = OFFERS[k];
    st().used[k] = usedToday(k) + 1;
    st().lastTip = Date.now();
    const line = o.reward();
    Sound.quest();
    toast(line, 'gold');
    save();
    UI.renderHud();
    UI.renderOffers();
  }

  /* the reflection offer pays on a real written line, not on a timer */
  function submitReflection(text) {
    text = String(text || '').trim();
    if (text.length < 8) { toast('A few more words than that'); return false; }
    st().used.reflect = usedToday('reflect') + 1;
    // straight into the practice journal, tagged as a reflection (0 minutes)
    S.dream.log = Array.isArray(S.dream.log) ? S.dream.log : [];
    S.dream.log.unshift({ d: todayStr(), m: 0, n: text.slice(0, 120) });
    S.dream.log = S.dream.log.slice(0, 60);
    grantGems(8);
    Sound.quest();
    toast('+8 gems · logged to your journal', 'gold');
    save();
    UI.renderHud();
    UI.renderOffers();
    return true;
  }

  /* a pure gem sink that protects the thing the app is actually about */
  const INSURE_COST = 30;
  function insureStreak() {
    if (st().insured) { toast('Streak already protected today'); return false; }
    if (S.player.gems < INSURE_COST) { toast(`Need ${INSURE_COST} gems`); return false; }
    S.player.gems -= INSURE_COST;
    st().insured = true;
    Sound.levelup();
    toast('Streak protected — one missed day will not break it', 'gold');
    save();
    UI.renderHud();
    UI.renderOffers();
    return true;
  }
  function isInsured() { return !!st().insured; }

  function list() {
    return Object.keys(OFFERS).map(k => ({
      key: k, ...OFFERS[k],
      left: left(k), ready: available(k), cooling: k === 'reflect' ? 0 : cooling(),
    }));
  }

  return { list, start, claim, submitReflection, insureStreak, isInsured,
           readyCount, available, INSURE_COST, CARD_MS };
})();
