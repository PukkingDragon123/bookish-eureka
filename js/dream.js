/* ============ Hourling — the dream you are chasing ============
   The whole app hangs off one answer: what are you trying to become good at?
   Everything below turns that answer into a concrete plan — today's focus,
   a weekly rhythm, a milestone ladder measured in real practised hours — and
   ties it to an element so the creature side of the game matches the dream. */
'use strict';

const Dream = (() => {

  /* Each dream: element affinity, the verb for a session, a pool of concrete
     focus tasks per experience level, and its own milestone names.          */
  const DREAMS = {
    music: {
      name: 'Music', icon: 'guitar', art: 'guitar', element: 'Mystic', verb: 'practise', gerund: 'practising',
      unit: 'practice', blurb: 'An instrument, your voice, production — anything you play.',
      tasks: {
        0: ['Learn where middle C / the 1st fret is', 'Play one note cleanly, 20 times',
            'Watch one beginner lesson and copy it', 'Learn to hold it comfortably',
            'Find one song you want to play some day'],
        1: ['Practise one chord change until it is clean', 'Play a scale slowly, both directions',
            'Learn the first 4 bars of your song', 'Play along to a metronome at 60bpm',
            'Record 30 seconds and listen back'],
        2: ['Take the hardest bar and loop it 20 times', 'Raise the metronome 5bpm on a known piece',
            'Learn a new chord voicing', 'Play a full piece without stopping',
            'Improvise for 5 minutes over one chord'],
        3: ['Transcribe 4 bars by ear', 'Work a piece at 90% tempo, clean', 'Record a full take',
            'Practise dynamics: same phrase, three feels', 'Write 8 bars of your own'],
      },
      ladder: ['First Sound', 'Clean Note', 'First Song', 'Steady Hands', 'Real Player',
               'Plays By Ear', 'Own Voice', 'Performer', 'Composer', 'Maestro'],
    },
    art: {
      name: 'Drawing & Art', icon: 'palette', art: 'palette', element: 'Nature', verb: 'draw', gerund: 'drawing',
      unit: 'drawing', blurb: 'Sketching, painting, pixel art, illustration.',
      tasks: {
        0: ['Fill one page with circles and lines', 'Draw the object nearest to you',
            'Copy one drawing you like', 'Draw your hand', 'Scribble for 10 minutes, no judging'],
        1: ['30 second gesture drawings x10', 'Draw the same object from 3 angles',
            'One value study in greyscale', 'Draw a face using guide lines', 'Sketch someone in public'],
        2: ['Study one master painting for composition', 'Draw hands for the whole session',
            'One finished small piece, start to end', 'Limited palette: 3 colours only',
            'Draw from imagination, no reference'],
        3: ['Thumbnail 6 compositions of one idea', 'Full render pass on a study',
            'Draw a crowd scene', 'Design a character turnaround', 'Paint from life, one hour'],
      },
      ladder: ['First Marks', 'Steady Line', 'Shapes Land', 'Sees Values', 'Draws Anything',
               'Own Style', 'Storyteller', 'Illustrator', 'Master Study', 'Artist'],
    },
    writing: {
      name: 'Writing', icon: 'pen', art: 'penbook', element: 'Shadow', verb: 'write', gerund: 'writing',
      unit: 'writing', blurb: 'Fiction, essays, journalling, poetry, a book.',
      tasks: {
        0: ['Write 100 words about your day', 'Describe a room in 5 sentences',
            'Write the worst opening line you can', 'List 10 things that annoy you',
            'Free-write for 10 minutes, no deleting'],
        1: ['Write 300 words, any subject', 'Write one page of pure dialogue',
            'Describe a person without their face', 'Rewrite yesterday, tighter', 'Write a scene in one location'],
        2: ['600 words toward the current piece', 'Cut 10% from something you wrote',
            'Write a scene from the other character', 'Read a page aloud and fix what trips',
            'Outline the next three beats'],
        3: ['1000 words, first draft, no editing', 'Full editing pass on a chapter',
            'Rewrite an opening five different ways', 'Submit or publish something',
            'Study a page you love, sentence by sentence'],
      },
      ladder: ['First Page', 'Daily Words', 'Finds a Voice', 'Scene Builder', 'Finishes Things',
               'Editor Eye', 'Chapter Done', 'Draft Complete', 'Revised', 'Author'],
    },
    fitness: {
      name: 'Fitness & Movement', icon: 'muscle', art: 'runshoe', element: 'Fire', verb: 'train', gerund: 'training',
      unit: 'training', blurb: 'Strength, running, flexibility, sport, just moving more.',
      tasks: {
        0: ['Walk for 10 minutes', 'Learn one squat with good form', '5 push-ups, knees fine',
            'Stretch everything that hurts', 'Put your shoes on and step outside'],
        1: ['3 rounds: squats, push-ups, rest', 'Walk or jog 15 minutes',
            'Hold a plank three times', 'Full mobility routine', 'Learn one new movement'],
        2: ['Add weight or reps to your main lift', 'Intervals: 6 hard, 6 easy',
            'Full body circuit, 20 minutes', 'Work your weakest movement', 'Long steady effort'],
        3: ['Heavy triple on the main lift', 'Threshold run', 'Skill session on a hard movement',
            'Deload and mobilise properly', 'Test a max or a time'],
      },
      ladder: ['Showed Up', 'Moves Daily', 'Form Locked', 'Getting Stronger', 'Real Engine',
               'Athlete Habits', 'Personal Best', 'Strong', 'Conditioned', 'Machine'],
    },
    language: {
      name: 'A New Language', icon: 'globe', art: 'headphones', element: 'Water', verb: 'study', gerund: 'studying',
      unit: 'study', blurb: 'Speak, read and understand something new.',
      tasks: {
        0: ['Learn 5 words you would actually use', 'Learn to say hello and thank you',
            'Listen to 5 minutes of the language', 'Learn the alphabet or first characters',
            'Say one sentence out loud'],
        1: ['10 new words with a spaced-repetition app', 'Listen to a 5-minute clip twice',
            'Write 3 sentences about today', 'Learn one grammar pattern', 'Shadow a native speaker'],
        2: ['Read a short article, note new words', 'Speak out loud for 5 minutes, alone is fine',
            'Watch a clip without subtitles', 'Write a paragraph and correct it',
            'Learn 15 words in one topic'],
        3: ['Have a conversation with a person', 'Read a chapter, no dictionary',
            'Watch a full episode natively', 'Write a page and get it corrected',
            'Think in the language for an hour'],
      },
      ladder: ['First Words', 'Can Greet', 'Simple Sentences', 'Understands Slowly', 'Holds a Chat',
               'Reads Alone', 'Watches Native', 'Thinks In It', 'Fluent Enough', 'Fluent'],
    },
    code: {
      name: 'Building & Code', icon: 'code', art: 'console', element: 'Metal', verb: 'build', gerund: 'building',
      unit: 'building', blurb: 'Programming, making things, side projects.',
      tasks: {
        0: ['Get one thing to print on screen', 'Follow a tutorial to the end',
            'Change one number and see what breaks', 'Learn what a variable is, by using one',
            'Set up your editor properly'],
        1: ['Build the smallest version that runs', 'Fix one bug without help',
            'Add one feature to your project', 'Read someone else\'s code for 10 min',
            'Learn one new function well'],
        2: ['Refactor something you wrote badly', 'Add tests to one piece', 'Ship a change',
            'Read the docs for something you use daily', 'Rebuild a feature from scratch, better'],
        3: ['Profile and speed something up', 'Design before you type: sketch it',
            'Review your own PR harshly', 'Learn one layer deeper than you need',
            'Publish or deploy it'],
      },
      ladder: ['Hello World', 'It Runs', 'First Bug Fixed', 'Ships Features', 'Reads Code',
               'Refactors', 'Tests It', 'Designs It', 'Ships Products', 'Engineer'],
    },
    cooking: {
      name: 'Cooking', icon: 'cook', art: 'chefhat', element: 'Earth', verb: 'cook', gerund: 'cooking',
      unit: 'cooking', blurb: 'Feed yourself well and enjoy doing it.',
      tasks: {
        0: ['Cook one thing with 5 ingredients', 'Learn to hold a knife properly',
            'Make eggs three ways this week', 'Taste and salt as you go', 'Clean as you cook, once'],
        1: ['Cook a meal without a recipe open', 'Learn one sauce by heart',
            'Batch cook for tomorrow', 'Roast vegetables until actually browned',
            'Use a herb you have never used'],
        2: ['Cook a cuisine you have never tried', 'Make bread or pasta from scratch',
            'Cook for someone else', 'Break down a whole vegetable or bird',
            'Balance a dish: fat, acid, salt, heat'],
        3: ['Plan and cook a three-course meal', 'Recreate a restaurant dish',
            'Ferment or cure something', 'Cook the same dish three ways', 'Write down your own recipe'],
      },
      ladder: ['First Meal', 'Knife Safe', 'No Recipe', 'Seasons Well', 'Feeds Others',
               'Makes Bread', 'Own Recipes', 'Hosts Dinner', 'Cooks Anything', 'Chef'],
    },
    mind: {
      name: 'Calm & Focus', icon: 'lotus', art: 'meditate', element: 'Ice', verb: 'sit', gerund: 'sitting',
      unit: 'practice', blurb: 'Meditation, journalling, sleep, a quieter head.',
      tasks: {
        0: ['Sit and breathe for 3 minutes', 'Write down what is on your mind',
            'Put the phone in another room for 20 min', 'Notice 5 things you can see',
            'Go to bed 20 minutes earlier'],
        1: ['10 minutes, following the breath', 'Journal three pages, unfiltered',
            'One walk with no headphones', 'Body scan before sleep', 'Name the feeling, don\'t fix it'],
        2: ['15 minutes, no guidance', 'Write what you are avoiding, then do 5 min of it',
            'A whole hour offline', 'Sit with something uncomfortable', 'Morning pages'],
        3: ['25 minutes unguided', 'A half-day without input', 'Journal on one question deeply',
            'Loving-kindness practice', 'Review your month honestly'],
      },
      ladder: ['First Sit', 'Three Minutes', 'Daily Pause', 'Notices Thoughts', 'Steadier',
               'Sits Long', 'Rides Discomfort', 'Clear Head', 'Present', 'Still'],
    },
    craft: {
      name: 'Making & Craft', icon: 'hammer', art: 'sewing', element: 'Earth', verb: 'make', gerund: 'making',
      unit: 'making', blurb: 'Woodwork, sewing, models, ceramics, repair.',
      tasks: {
        0: ['Tidy and lay out your tools', 'Make one very small thing badly',
            'Learn one joint, stitch or knot', 'Measure twice on scrap', 'Watch one technique video and copy it'],
        1: ['Finish a small project fully', 'Practise the technique you avoid',
            'Sharpen or service your tools', 'Make the same piece twice', 'Fix something that is broken'],
        2: ['Design before making: draw it', 'Work to a tolerance you find hard',
            'Try a new material', 'Finish and seal properly', 'Make a gift for someone'],
        3: ['A piece with three techniques in it', 'Build your own jig or pattern',
            'Refine a design over iterations', 'Teach the technique to someone', 'Sell or exhibit a piece'],
      },
      ladder: ['First Cut', 'Tools Ready', 'Finishes Small', 'Clean Work', 'Designs First',
               'New Materials', 'Precise', 'Makes Gifts', 'Own Designs', 'Craftsman'],
    },
    photo: {
      name: 'Photography', icon: 'camera', art: 'camera', element: 'Electric', verb: 'shoot', gerund: 'shooting',
      unit: 'shooting', blurb: 'See better, and keep what you saw.',
      tasks: {
        0: ['Take 20 photos of one object', 'Shoot only in one direction of light',
            'Learn what the exposure triangle is', 'Photograph your walk to somewhere',
            'Delete 90% and keep the best 2'],
        1: ['Shoot a roll / 36 frames on one theme', 'Manual mode only, whole session',
            'Photograph a stranger, ask first', 'Golden hour shoot', 'Edit 3 photos properly'],
        2: ['One subject, 50 frames, find the shot', 'Shoot in bad light on purpose',
            'Build a 6-photo series', 'Study a photographer and copy their eye',
            'Print one photo'],
        3: ['Complete a photo essay', 'Shoot an event start to finish',
            'Develop a consistent edit', 'Critique your last 100 honestly', 'Publish a set'],
      },
      ladder: ['First Frames', 'Sees Light', 'Manual Mode', 'Composes', 'Edits Well',
               'Has a Series', 'Own Eye', 'Photo Essay', 'Published', 'Photographer'],
    },
    study: {
      name: 'Learning a Subject', icon: 'book', art: 'book', element: 'Mystic', verb: 'study', gerund: 'studying',
      unit: 'study', blurb: 'A degree, a certification, or pure curiosity.',
      tasks: {
        0: ['Read 5 pages and note one thing', 'Find out what you do not know yet',
            'Write the syllabus you will follow', 'Watch one lecture', 'Explain today\'s topic in 3 lines'],
        1: ['Active recall: close the book and write', '25 minutes on the hardest topic',
            'Do 5 practice problems', 'Make flashcards for one section', 'Teach it to an empty room'],
        2: ['Past paper under time pressure', 'Connect two topics you learned separately',
            'Redo the questions you got wrong', 'Summarise a chapter from memory',
            'Find the gap and fill it'],
        3: ['Full mock exam', 'Write an essay-length answer', 'Teach it to a real person',
            'Read a primary source', 'Build something with what you learned'],
      },
      ladder: ['Started', 'Knows the Map', 'Recalls It', 'Solves Problems', 'Connects Ideas',
               'Handles Exams', 'Teaches It', 'Applies It', 'Deep Knowledge', 'Expert'],
    },
    dance: {
      name: 'Dance & Performance', icon: 'walk', art: 'sneaker', element: 'Fire', verb: 'move', gerund: 'moving',
      unit: 'dance', blurb: 'Any style — just move like you mean it.',
      tasks: {
        0: ['Move to one song, alone, badly', 'Learn one 8-count', 'Find your natural bounce',
            'Watch a routine and copy 4 counts', 'Warm up properly once'],
        1: ['Drill one 8-count until clean', 'Freestyle for one full song',
            'Learn a short routine', 'Film yourself and watch it', 'Work on isolations'],
        2: ['Full routine, full out, three times', 'Practise musicality on one track',
            'Learn a style outside your comfort', 'Clean the transitions', 'Freestyle to unfamiliar music'],
        3: ['Choreograph 32 counts', 'Perform for someone', 'Train the weakest body part',
            'Film a clean take', 'Teach a combo'],
      },
      ladder: ['First Move', 'Finds Rhythm', 'Learns Routines', 'Clean Counts', 'Freestyles',
               'Musical', 'Choreographs', 'Performs', 'Own Style', 'Dancer'],
    },
  };

  const LEVELS = [
    { key: 0, name: 'Curious', desc: 'Never really tried it', mins: 10 },
    { key: 1, name: 'Beginner', desc: 'Dabbled a bit', mins: 20 },
    { key: 2, name: 'Building', desc: 'Practise semi-regularly', mins: 30 },
    { key: 3, name: 'Serious', desc: 'Deep in it already', mins: 45 },
  ];

  /* hours of real practice needed to reach each rung */
  const LADDER_HOURS = [0.25, 1, 3, 6, 12, 20, 35, 55, 80, 120];

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function def() { return DREAMS[S.dream.key] || DREAMS.music; }
  function levelDef() { return LEVELS[S.dream.level] || LEVELS[0]; }

  /* ---------- plan ---------- */
  /* Day one is never a rest day — nobody should meet this app and be told
     to come back Monday. After the first session the real schedule applies. */
  function scheduledToday() {
    if (!(S.dream.sessions > 0)) return true;
    return (S.dream.days || []).includes(new Date().getDay());
  }
  function hoursLogged() { return (S.dream.minutes || 0) / 60; }

  function rung() {
    const h = hoursLogged();
    let r = 0;
    for (let i = 0; i < LADDER_HOURS.length; i++) if (h >= LADDER_HOURS[i]) r = i + 1;
    return r;                                   // 0..10
  }
  function rungName() {
    const r = rung();
    return r === 0 ? 'Not started' : def().ladder[Math.min(r - 1, 9)];
  }
  function nextRung() {
    const r = rung();
    if (r >= 10) return null;
    return { name: def().ladder[r], hours: LADDER_HOURS[r],
             frac: clamp(hoursLogged() / LADDER_HOURS[r], 0, 1) };
  }

  /* today's focus task: stable for the day, drawn from the level's pool */
  function todaysTask() {
    const d = def();
    const pool = d.tasks[S.dream.level] || d.tasks[0];
    const day = todayStr();
    let h = 0;
    for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
    return pool[(h + (S.dream.taskSkips || 0)) % pool.length];
  }
  function rerollTask() {
    S.dream.taskSkips = (S.dream.taskSkips || 0) + 1;
    save();
  }

  function doneToday() {
    return S.dream.lastDone === todayStr();
  }
  function minutesToday() {
    return S.dream.lastDone === todayStr() ? (S.dream.todayMinutes || 0) : 0;
  }

  /* minutes practised on each of the last 7 calendar days, Sun..Sat of this week */
  function weekMinutes() {
    const out = [0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    for (const e of (S.dream.log || [])) {
      const p = String(e.d || '').split('-').map(Number);
      if (p.length !== 3) continue;
      const d = new Date(p[0], p[1] - 1, p[2]);
      const off = Math.round((d - sunday) / 86400000);
      if (off >= 0 && off < 7) out[off] += e.m || 0;
    }
    return out;
  }

  /* ---------- completing a session ---------- */
  function completeSession(mins, note) {
    const today = todayStr();
    if (S.dream.lastDone !== today) S.dream.todayMinutes = 0;
    S.dream.minutes = (S.dream.minutes || 0) + mins;
    S.dream.todayMinutes = (S.dream.todayMinutes || 0) + mins;
    S.dream.sessions = (S.dream.sessions || 0) + 1;
    const beforeRung = S.dream._lastRung || 0;
    S.dream.lastDone = today;
    S.dream.log = Array.isArray(S.dream.log) ? S.dream.log : [];
    S.dream.log.unshift({ d: today, m: mins, n: (note || '').slice(0, 120) });
    S.dream.log = S.dream.log.slice(0, 60);
    bumpStreakToday();

    // rewards scale with real minutes
    const el = def().element;
    const mana = grantMana(Math.round(mins * 2.2 * streakMult()));
    const xp = grantPlayerXp(Math.round(mins * 3.5 * streakMult()));
    const ess = grantEssence(Math.max(2, Math.round(mins / 5)));
    const seeds = grantSeeds(Math.max(2, Math.round(mins / 8)));
    // a real session is the hardest thing the app asks for; it should pay like it
    const gold = grantGold(Math.round(mins * 14 * Math.pow(1.12, globalStage())));
    grantGems(Math.max(1, Math.round(mins / 12)));
    Farm.waterAll(Math.max(4, Math.round(mins / 2)));

    // the beast that shares your dream's element grows fastest
    for (const cid of S.party) {
      const c = C_BY_ID[cid];
      const match = c && c.types.includes(el);
      grantBeastXpTo(cid, Math.round(mins * (match ? 9 : 5)));
    }

    Quests.progress('session', 1);
    Quests.progress('session_mins', mins);
    Quests.progress('any_habit', 1);
    // practice is the heaviest contributor to the event track, by design
    Events.add(mins + 15, 'session');

    const nowRung = rung();
    S.dream._lastRung = nowRung;
    save();
    return { mana, xp, ess, seeds, mins, gold,
             rungUp: nowRung > beforeRung ? def().ladder[nowRung - 1] : null };
  }

  /* ---------- setup ---------- */
  function setup(key, level, mins, days, why) {
    S.dream = {
      key, level, mins, days, why: (why || '').slice(0, 160),
      minutes: 0, sessions: 0, todayMinutes: 0, lastDone: null,
      taskSkips: 0, log: [], _lastRung: 0, started: Date.now(),
    };
    save();
  }

  function starterOptions() {
    const el = def().element;
    const pool = window.CREATURES.filter(c => c.stage === 1 && c.types.includes(el) && c.line);
    const fallback = window.CREATURES.filter(c => c.stage === 1 && c.line);
    const src = pool.length >= 3 ? pool : (pool.concat(fallback));
    const seen = new Set();
    const out = [];
    for (const c of src) {
      if (seen.has(c.line)) continue;
      seen.add(c.line);
      out.push(c.id);
      if (out.length === 3) break;
    }
    return out;
  }

  return { DREAMS, LEVELS, DAY_NAMES, LADDER_HOURS,
           def, levelDef, scheduledToday, hoursLogged, rung, rungName, nextRung,
           todaysTask, rerollTask, doneToday, minutesToday, weekMinutes,
           completeSession, setup, starterOptions };
})();
