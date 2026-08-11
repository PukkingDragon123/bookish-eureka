/* ============ Hourling — quests v3 ============
   Daily quests generated from the player's goals, a 7-day login chest row,
   and one hand-authored "challenge of the day" — a real thing to go do,
   online or outside, with a link where one helps.                           */
'use strict';

const Quests = (() => {

  const TEMPLATES = {
    fitness: [
      { key: 'habit_exercise', icon: 'muscle', name: 'Complete an exercise session', target: 1, reward: { gems: 8, seeds: 2 } },
      { key: 'habit_walk', icon: 'walk', name: 'Finish a walk timer', target: 1, reward: { gems: 6, seeds: 2 } },
      { key: 'timer_mins', icon: 'timer', name: 'Put in 20 active minutes', target: 20, reward: { gems: 7, seeds: 1 } },
      { key: 'habit_water', icon: 'water', name: 'Drink 4 glasses of water', target: 4, reward: { gems: 5, seeds: 1 } },
      { key: 'habit_exercise', icon: 'muscle', name: 'Two exercise sessions', target: 2, reward: { gems: 12, ess: 15 } },
    ],
    nutrition: [
      { key: 'habit_meal', icon: 'meal', name: 'Eat 2 good meals', target: 2, reward: { gems: 7, seeds: 3 } },
      { key: 'meals_logged', icon: 'scroll', name: 'Log 3 foods', target: 3, reward: { gems: 6, seeds: 3 } },
      { key: 'habit_cook', icon: 'cook', name: 'Cook something yourself', target: 1, reward: { gems: 8, seeds: 2 } },
      { key: 'meals_logged', icon: 'scroll', name: 'Log everything you eat today', target: 5, reward: { gems: 11, seeds: 4 } },
      { key: 'feed', icon: 'meal', name: 'Feed your beasts twice', target: 2, reward: { gems: 5, seeds: 2 } },
    ],
    mind: [
      { key: 'habit_wake', icon: 'sunrise', name: 'Morning check-in', target: 1, reward: { gems: 6, ess: 10 } },
      { key: 'habit_water', icon: 'water', name: 'Drink 5 glasses of water', target: 5, reward: { gems: 7, seeds: 1 } },
      { key: 'any_habit', icon: 'paw', name: 'Clear 4 daily quests', target: 4, reward: { gems: 10, ess: 20 } },
      { key: 'session', icon: 'star', name: 'One quiet session, no phone', target: 1, reward: { gems: 9, ess: 15 } },
      { key: 'reflect', icon: 'scroll', name: 'Write today down', target: 1, reward: { gems: 6, ess: 10 } },
    ],
    create: [
      { key: 'habit_create', icon: 'palette', name: 'Finish a making session', target: 1, reward: { gems: 8, ess: 15 } },
      { key: 'timer_mins', icon: 'timer', name: '25 minutes of deep work', target: 25, reward: { gems: 7, ess: 12 } },
      { key: 'any_habit', icon: 'star', name: 'Clear 3 daily quests', target: 3, reward: { gems: 7, seeds: 2 } },
      { key: 'session_mins', icon: 'timer', name: 'Practise 40 minutes total', target: 40, reward: { gems: 12, ess: 25 } },
      { key: 'reflect', icon: 'scroll', name: 'Note one thing that worked', target: 1, reward: { gems: 6, ess: 10 } },
    ],
    battle: [
      { key: 'kills', icon: 'sword', name: 'Defeat 40 wild beasts', target: 40, reward: { gold: true, gems: 5 } },
      { key: 'kills', icon: 'sword', name: 'Defeat 150 wild beasts', target: 150, reward: { gold: true, gems: 9 } },
      { key: 'boss', icon: 'skull', name: 'Defeat a boss', target: 1, reward: { gems: 8, ess: 15 } },
      { key: 'summon', icon: 'mana', name: 'Perform a summon', target: 1, reward: { gems: 6, ess: 10 } },
      { key: 'merge', icon: 'relic', name: 'Fuse 4 pieces of gear', target: 4, reward: { gems: 7, seeds: 1 } },
      { key: 'levelup_beast', icon: 'star', name: 'Level a beast twice', target: 2, reward: { gems: 6, gold: true } },
      { key: 'duel', icon: 'sword', name: 'Win a duel in the Arena', target: 1, reward: { gems: 10, gold: true } },
      { key: 'harvest', icon: 'seed', name: 'Harvest 4 crops', target: 4, reward: { gems: 6, seeds: 2 } },
    ],
    core: [
      { key: 'session', icon: 'play', name: 'Complete a practice session', target: 1, reward: { gems: 12, ess: 20 } },
      { key: 'session_mins', icon: 'timer', name: 'Practise for 25 minutes', target: 25, reward: { gems: 9, ess: 15 } },
    ],
  };

  /* Bonus duty: unlocked only once every daily quest is claimed, then offered
     in sets. Finishing your quests is supposed to open more of them, not end
     the day — that is the whole point of coming back in the evening. */
  const BONUS = [
    { key: 'kills', icon: 'sword', name: 'Clear 80 more beasts', target: 80, reward: { gems: 14, gold: true } },
    { key: 'session_mins', icon: 'timer', name: 'Another 15 minutes', target: 15, reward: { gems: 18, ess: 25 } },
    { key: 'merge', icon: 'relic', name: 'Fuse 3 more pieces', target: 3, reward: { gems: 12, seeds: 3 } },
    { key: 'harvest', icon: 'seed', name: 'Harvest 3 more crops', target: 3, reward: { gems: 12, seeds: 4 } },
    { key: 'boss', icon: 'skull', name: 'Take down one more boss', target: 1, reward: { gems: 20, ess: 30 } },
    { key: 'summon', icon: 'mana', name: 'One more summon', target: 1, reward: { gems: 14, ess: 20 } },
    { key: 'any_habit', icon: 'paw', name: 'Two more habits', target: 2, reward: { gems: 16, gold: true } },
    { key: 'feed', icon: 'meal', name: 'Feed the party twice more', target: 2, reward: { gems: 12, seeds: 3 } },
  ];
  const BONUS_SETS = 3;              // per day, so the well is deep but not endless

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
    { name: 'Beat your best typing speed', desc: 'One clean run. Warm your hands up first.', link: 'https://monkeytype.com', tags: ['mind', 'create'], icon: 'bolt' },
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
  /* Two weeks, not one, and it climbs. Day 14 is worth showing up fourteen
     times for; the cycle then repeats so a long-term player keeps a reason to
     open the app first thing. */
  const LOGIN = [
    { icon: 'gold',    text: '1,200 gold', grant: () => grantGold(1200) },
    { icon: 'seed',    text: '6 seeds',    grant: () => grantSeeds(6) },
    { icon: 'gem',     text: '30 gems',    grant: () => grantGems(30) },
    { icon: 'essence', text: '60 essence', grant: () => grantEssence(60) },
    { icon: 'gem',     text: '45 gems',    grant: () => grantGems(45) },
    { icon: 'mana',    text: '180 mana',   grant: () => grantMana(180) },
    { icon: 'chest',   text: 'Week chest',
      grant: () => { grantGems(90); grantSeeds(8); grantGold(5000); } },
    { icon: 'gold',    text: '4,000 gold', grant: () => grantGold(4000) },
    { icon: 'seed',    text: '12 seeds',   grant: () => grantSeeds(12) },
    { icon: 'gem',     text: '70 gems',    grant: () => grantGems(70) },
    { icon: 'essence', text: '180 essence', grant: () => grantEssence(180) },
    { icon: 'gem',     text: '90 gems',    grant: () => grantGems(90) },
    { icon: 'mana',    text: '400 mana',   grant: () => grantMana(400) },
    { icon: 'chest',   text: 'Grand chest',
      grant: () => { grantGems(200); grantSeeds(16); grantGold(14000); grantEssence(250); } },
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
    // every extra goal the player is running adds its own quest to the board
    (S.sideGoals || []).forEach((sg, i) => {
      const tags = DREAM_TAGS[sg.key] || [];
      tags.slice(0, 1).forEach(t => {
        goalPool.push(...seededShuffle(TEMPLATES[t] || [], seed + 40 + i).slice(0, 1));
      });
    });
    const core = seededShuffle(TEMPLATES.core, seed + 3).slice(0, 1);
    const battle = seededShuffle(TEMPLATES.battle, seed + 7).slice(0, 4);
    const picked = [...core, ...goalPool.slice(0, 4), ...battle];
    // the same key twice on one board would double-count every progress call
    const seen = {};
    const list = picked.filter(t => (seen[t.key + t.target] ? false : (seen[t.key + t.target] = 1)))
      .map((t, i) => ({
        qid: day + '_' + i,
        key: t.key, icon: t.icon, name: t.name, target: t.target,
        progress: 0, claimed: false, reward: t.reward,
      }));
    S.quests = { day, list, bonusSets: 0, bonus: [] };

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

  /* ---- bonus duty ---- */
  function dailiesCleared() {
    const l = S.quests.list || [];
    return l.length > 0 && l.every(q => q.claimed);
  }
  function bonusLeft() {
    return Math.max(0, BONUS_SETS - (S.quests.bonusSets || 0));
  }
  /* hand out the next set of two. Called from the UI, never automatically, so
     the player chooses to take on more rather than being handed a new list. */
  function drawBonus() {
    if (!dailiesCleared() || bonusLeft() <= 0) return false;
    const n = S.quests.bonusSets || 0;
    const seed = parseInt(todayStr().replace(/-/g, ''), 10) + 100 + n * 13;
    const picked = seededShuffle(BONUS, seed).slice(0, 2);
    S.quests.bonus = (S.quests.bonus || []);
    picked.forEach((t, i) => {
      S.quests.list.push({
        qid: todayStr() + '_b' + n + '_' + i, bonus: true,
        key: t.key, icon: t.icon, name: t.name, target: t.target,
        progress: 0, claimed: false, reward: t.reward,
      });
    });
    S.quests.bonusSets = n + 1;
    Sound.quest();
    save();
    return true;
  }

  /* login rewards: returns today's claimable index or -1 */
  function loginClaimable() {
    return S.login.lastDay === todayStr() ? -1 : (S.login.cycle % LOGIN.length);
  }
  function claimLogin() {
    if (loginClaimable() < 0) return null;
    const idx = S.login.cycle % LOGIN.length;
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
    if (r.ess) { grantEssence(r.ess); bits.push(`+${r.ess} essence`); }
    const g = grantGold(140 * Math.pow(1.2, globalStage()));
    bits.push(`+${fmt(g)} gold`);
    Sound.quest();
    confetti(24);
    if (btnEl) coinBurst(btnEl, 5);
    toast(`Quest complete! ${bits.join(' ')}`, 'gold');
    grantPlayerXp(45);
    Farm.waterAll(5);
    Events.add(14, 'quest');
    S.stats = S.stats || {};
    S.stats.questsClaimed = (S.stats.questsClaimed || 0) + 1;
    save();
    UI.renderQuests();
    UI.renderQuestLog();
    UI.renderHud();
    if (S.quests.list.every(x => x.claimed)) {
      UI.markQuestDot(false);
      // clearing the board is its own event, and it opens bonus duty
      if (bonusLeft() > 0) {
        confetti(50);
        Sound.levelup();
        grantGems(20);
        toast('Board cleared! +20 gems, and Vale has more work', 'gold');
      }
    }
    UI.renderAchievements();
  }

  return { generateToday, progress, claim, todaysChallenge, completeChallenge,
           loginClaimable, claimLogin, LOGIN, CHALLENGE_REWARD,
           dailiesCleared, bonusLeft, drawBonus, BONUS_SETS };
})();
