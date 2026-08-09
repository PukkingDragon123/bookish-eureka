/* ============ Hourling — quests v3 ============
   Daily quests generated from the player's goals, a 7-day login chest row,
   and one hand-authored "challenge of the day" — a real thing to go do,
   online or outside, with a link where one helps.                           */
'use strict';

const Quests = (() => {

  const TEMPLATES = {
    fitness: [
      { key: 'habit_exercise', icon: 'muscle', name: 'Complete an exercise session', target: 1, reward: { gems: 6, lp: 3 } },
      { key: 'habit_walk', icon: 'walk', name: 'Finish a walk timer', target: 1, reward: { gems: 4, seeds: 1 } },
      { key: 'timer_mins', icon: 'timer', name: 'Put in 20 active minutes', target: 20, reward: { gems: 5, lp: 2 } },
    ],
    nutrition: [
      { key: 'habit_meal', icon: 'meal', name: 'Eat 2 healthy meals', target: 2, reward: { gems: 5, seeds: 2 } },
      { key: 'meals_logged', icon: 'scroll', name: 'Log 3 foods in the tracker', target: 3, reward: { gems: 4, seeds: 2 } },
      { key: 'habit_cook', icon: 'cook', name: 'Cook something yourself', target: 1, reward: { gems: 5, lp: 2 } },
    ],
    mind: [
      { key: 'habit_wake', icon: 'sunrise', name: 'Do your morning check-in', target: 1, reward: { gems: 4, lp: 2 } },
      { key: 'habit_water', icon: 'water', name: 'Drink 5 glasses of water', target: 5, reward: { gems: 5, seeds: 1 } },
      { key: 'any_habit', icon: 'paw', name: 'Complete 4 daily quests', target: 4, reward: { gems: 6, lp: 3 } },
    ],
    create: [
      { key: 'habit_create', icon: 'palette', name: 'Finish a create session', target: 1, reward: { gems: 6, lp: 3 } },
      { key: 'timer_mins', icon: 'timer', name: 'Spend 25 minutes in deep work', target: 25, reward: { gems: 5, lp: 2 } },
      { key: 'any_habit', icon: 'star', name: 'Complete 3 daily quests', target: 3, reward: { gems: 4, seeds: 1 } },
    ],
    battle: [
      { key: 'kills', icon: 'sword', name: 'Defeat 40 wild beasts', target: 40, reward: { gold: true, gems: 3 } },
      { key: 'boss', icon: 'skull', name: 'Defeat a boss', target: 1, reward: { gems: 5, lp: 3 } },
      { key: 'summon', icon: 'mana', name: 'Perform a summon', target: 1, reward: { gems: 4, lp: 2 } },
      { key: 'merge', icon: 'relic', name: 'Fuse 4 items on the board', target: 4, reward: { gems: 4, lp: 2 } },
      { key: 'session', icon: 'star', name: 'Complete a practice session', target: 1, reward: { gems: 8, lp: 5 } },
      { key: 'session_mins', icon: 'timer', name: 'Practise for 25 real minutes', target: 25, reward: { gems: 6, lp: 4 } },
      { key: 'feed', icon: 'meal', name: 'Feed your beasts 3 times', target: 3, reward: { gems: 4, seeds: 1 } },
      { key: 'harvest', icon: 'seed', name: 'Harvest 4 crops', target: 4, reward: { gems: 4, lp: 2 } },
    ],
  };

  /* ---- challenge of the day: real, odd, fun. link opens in a new tab ---- */
  const CHALLENGES = [
    { name: 'Draw a three-headed goose', desc: 'Any medium. The middle head must look unimpressed. 3 minutes minimum.', tags: ['create'], icon: 'palette' },
    { name: 'Win 5 rounds of GeoGuessr', desc: 'Free mode counts. Learn where roads look suspicious.', link: 'https://www.geoguessr.com', tags: ['mind'], icon: 'map' },
    { name: 'Make a 5-minute duck game', desc: 'Ducks, marshmallows, chaos — sketch a tiny game on Scratch. Nobody said good.', link: 'https://scratch.mit.edu/projects/editor/', tags: ['create'], icon: 'palette' },
    { name: 'Read one random Wikipedia article aloud', desc: 'Whatever fate serves. Dramatic voice mandatory.', link: 'https://en.wikipedia.org/wiki/Special:Random', tags: ['mind'], icon: 'book' },
    { name: 'Photograph something older than you', desc: 'Outside, ideally. Bonus respect if it is a tree.', tags: ['fitness', 'mind'], icon: 'map' },
    { name: '20 squats, music on', desc: 'One song, twenty squats, no negotiating with the chorus.', tags: ['fitness'], icon: 'muscle' },
    { name: 'Learn "good morning" in 3 languages', desc: 'Say all three to someone (a pet counts) tomorrow morning.', tags: ['mind'], icon: 'sunrise' },
    { name: 'Write a six-word story', desc: 'Exactly six. Make one word do crimes.', tags: ['create'], icon: 'scroll' },
    { name: 'Beat your best typing speed', desc: 'One honest run. Warm up your hands first.', link: 'https://monkeytype.com', tags: ['mind', 'create'], icon: 'bolt' },
    { name: 'Cook one thing you cannot pronounce', desc: 'Find a recipe whose name you must practice saying. Attempt both.', tags: ['nutrition'], icon: 'cook' },
    { name: 'Walk somewhere you have never stood', desc: 'Even 200m away. New ground under your feet today.', tags: ['fitness'], icon: 'walk' },
    { name: 'Draw your starter beast from memory', desc: 'No peeking at the dex. Compare after. Apologise to it.', tags: ['create'], icon: 'paw' },
    { name: 'Solve today\'s Wordle in 4 or fewer', desc: 'Vowels first, hubris second.', link: 'https://www.nytimes.com/games/wordle/index.html', tags: ['mind'], icon: 'book' },
    { name: 'Fruit you have never tried', desc: 'Buy it, eat it, rate it out of ten like a stern judge.', tags: ['nutrition'], icon: 'meal' },
    { name: 'Ten-minute tidy sprint', desc: 'One timer, one surface, total war.', tags: ['mind', 'fitness'], icon: 'timer' },
    { name: 'Compliment three strangers\' dogs', desc: 'To the owner, out loud. The dogs already know.', tags: ['fitness', 'mind'], icon: 'paw' },
  ];
  const CHALLENGE_REWARD = { lp: 8, gems: 12 };

  /* ---- 7-day login row ---- */
  const LOGIN = [
    { icon: 'gold',    text: '1,200 gold',  grant: () => grantGold(1200) },
    { icon: 'seed',    text: '6 seeds',     grant: () => grantSeeds(6) },
    { icon: 'gem',     text: '30 gems',     grant: () => grantGems(30) },
    { icon: 'essence', text: '60 essence',  grant: () => grantEssence(60) },
    { icon: 'gem',     text: '45 gems',     grant: () => grantGems(45) },
    { icon: 'mana',    text: '180 mana',    grant: () => grantMana(180) },
    { icon: 'chest',   text: 'Grand chest',
      grant: () => { grantGems(120); grantSeeds(10); grantGold(8000); grantEssence(150); } },
  ];

  /* which quest pools and challenge tags suit the chosen dream */
  const DREAM_TAGS = {
    music: ['create', 'mind'], art: ['create'], writing: ['create', 'mind'],
    fitness: ['fitness'], language: ['mind'], code: ['create', 'mind'],
    cooking: ['nutrition'], mind: ['mind'], craft: ['create'],
    photo: ['create', 'fitness'], study: ['mind'], dance: ['fitness', 'create'],
  };
  function activeTags() {
    const t = DREAM_TAGS[S.dream && S.dream.key];
    return t && t.length ? t : ['mind'];
  }

  function seededShuffle(arr, seed) {
    const rng = (() => { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateToday() {
    const day = todayStr();
    if (S.quests.day === day) return;
    const seed = parseInt(day.replace(/-/g, ''), 10);
    const goals = activeTags();
    const goalPool = [];
    goals.forEach((g, i) => {
      goalPool.push(...seededShuffle(TEMPLATES[g] || [], seed + i).slice(0, 2));
    });
    const battle = seededShuffle(TEMPLATES.battle, seed + 7).slice(0, 3);
    const list = [...goalPool.slice(0, 2), ...battle].map((t, i) => ({
      qid: day + '_' + i,
      key: t.key, icon: t.icon, name: t.name, target: t.target,
      progress: 0, claimed: false, reward: t.reward,
    }));
    S.quests = { day, list };

    // challenge of the day, biased toward the player's goals
    const fits = CHALLENGES.map((c, i) => ({ c, i }))
      .filter(x => x.c.tags.some(t => goals.includes(t)));
    const pool = fits.length ? fits : CHALLENGES.map((c, i) => ({ c, i }));
    const choice = pool[seed % pool.length];
    S.challenge = { day, idx: choice.i, done: false };
    save();
  }

  function todaysChallenge() {
    generateToday();
    return CHALLENGES[S.challenge.idx] || CHALLENGES[0];
  }

  function completeChallenge(btnEl) {
    if (S.challenge.done) return;
    S.challenge.done = true;
    grantGems(CHALLENGE_REWARD.lp);
    grantGems(CHALLENGE_REWARD.gems);
    grantPlayerXp(40);
    bumpStreakToday();
    Farm.waterAll(6);
    Sound.quest();
    confetti(40);
    if (btnEl) coinBurst(btnEl, 6);
    toast(`Challenge conquered! +${CHALLENGE_REWARD.lp} lab points, +${CHALLENGE_REWARD.gems} gems`, 'gold');
    save();
    UI.renderQuests();
    UI.renderHud();
  }

  /* login rewards: returns today's claimable index or -1 */
  function loginClaimable() {
    return S.login.lastDay === todayStr() ? -1 : (S.login.cycle % 7);
  }
  function claimLogin() {
    if (loginClaimable() < 0) return null;
    const idx = S.login.cycle % 7;
    LOGIN[idx].grant();
    S.login.cycle++;
    S.login.lastDay = todayStr();
    Sound.quest();
    confetti(26);
    save();
    return LOGIN[idx];
  }

  function progress(key, n) {
    if (!S.quests.list) return;
    let changed = false;
    for (const q of S.quests.list) {
      if (q.key === key && !q.claimed && q.progress < q.target) {
        q.progress = Math.min(q.target, q.progress + n);
        changed = true;
        if (q.progress >= q.target) {
          toast(`Quest ready to claim: ${q.name}`, 'good');
          UI.markQuestDot(true);
        }
      }
    }
    if (changed) {
      if (UI.currentTab() === 'quests') UI.renderQuests();
      UI.renderQuestLog();
    }
  }

  function claim(qid, btnEl) {
    const q = S.quests.list.find(x => x.qid === qid);
    if (!q || q.claimed || q.progress < q.target) return;
    q.claimed = true;
    const r = q.reward;
    const bits = [];
    if (r.gems) { grantGems(r.gems); bits.push(`+${r.gems} gems`); }
    if (r.lp) { grantGems(r.lp); bits.push(`+${r.lp} gems`); }
    if (r.seeds) { grantSeeds(r.seeds); bits.push(`+${r.seeds} seeds`); }
    if (r.mana) { grantMana(r.mana); bits.push(`+${r.mana} mana`); }
    const g = grantGold(140 * Math.pow(1.2, globalStage()));
    bits.push(`+${fmt(g)} gold`);
    Sound.quest();
    confetti(24);
    if (btnEl) coinBurst(btnEl, 5);
    toast(`Quest complete! ${bits.join(' ')}`, 'gold');
    grantPlayerXp(45);
    Farm.waterAll(5);
    Events.add(14, 'quest');
    save();
    UI.renderQuests();
    UI.renderQuestLog();
    UI.renderHud();
    if (S.quests.list.every(x => x.claimed)) UI.markQuestDot(false);
  }

  return { generateToday, progress, claim, todaysChallenge, completeChallenge,
           loginClaimable, claimLogin, LOGIN, CHALLENGE_REWARD };
})();
