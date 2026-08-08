/* ============ the Professor — interactive guide ============

   A guided first run, led by the mentor sprite the player uploaded. It is not
   a wall of text with a Next button: each step dims the screen except for one
   real element, the professor points at it, and where a step asks you to do
   something the guide waits for you to actually do it rather than for you to
   press Next.

   Every step names a live selector, so the spotlight tracks the real layout —
   if a control moves, the hole moves with it.                              */
'use strict';

const Tutor = (() => {
  /* where: css selector to spotlight (null = no hole, just the professor)
     tab:   switch here first
     do:    { event } — the step completes when Game fires that, not on Next
     side:  'top' | 'bottom' — which half the bubble sits in            */
  const STEPS = [
    { text: "There you are. I'm Professor Vale — I study what people become when they keep showing up. Give me two minutes and I'll show you how this works.",
      tab: 'today', where: null, side: 'bottom' },

    { text: "This is your dream and the ladder under it. Ten rungs, measured in hours you have genuinely practised. Nothing else moves it.",
      tab: 'today', where: '#today-hero', side: 'bottom' },

    { text: "Today's focus is one concrete task. Not \"practise more\" — one thing, with a timer. That is the whole engine.",
      tab: 'today', where: '#focus-card', side: 'bottom' },

    { text: "Your minutes become mana, and mana is what everything else in here runs on. Real practice, real currency. There is no other way to earn it.",
      tab: 'today', where: '.mana-chip', side: 'bottom' },

    { text: "Meanwhile your beasts fight on their own. Tap Battle and I'll show you.",
      tab: 'today', where: '#tabbar button[data-tab="battle"]', side: 'top',
      wait: { tab: 'battle' } },

    { text: "They fight slowly and steadily, whether or not you are watching. Come back after a session and you will have made progress.",
      tab: 'battle', where: '#scene', side: 'bottom' },

    { text: "In a hurry? Gems buy five minutes of triple speed. Useful before a boss — never necessary.",
      tab: 'battle', where: '#haste-btn', side: 'bottom' },

    { text: "Down here is the Forge. Spin the wheel, drag two matching pieces together, and every piece on the board quietly buffs your party.",
      tab: 'battle', where: '#merge-panel', side: 'top', openPanel: 'fusion' },

    { text: "Quests turn your real habits into rewards — water, walks, cooking, whatever you signed up for. That is where the gems come from.",
      tab: 'quests', where: '#quest-list', side: 'bottom' },

    { text: "That's everything. Put in one real session today and the rest follows. I'll be in Settings if you want this again.",
      tab: 'today', where: null, side: 'bottom' },
  ];

  let idx = 0, active = false, root = null, onTab = null;

  function done() { return !!(S.tutorial && S.tutorial.done); }

  function start(fromSettings) {
    if (active) return;
    // the guide owns the screen: clear anything already sitting over the app
    try { closeAllModals(); } catch (e) {}
    active = true;
    idx = 0;
    root = el('div', 'tut-root');
    root.innerHTML = `
      <div class="tut-veil">
        <div class="tut-hole"></div>
      </div>
      <div class="tut-prof">
        <img class="tut-sprite" src="${assetUrl('assets/ui/npc.png')}" alt="Professor Vale">
        <div class="tut-bubble">
          <div class="tut-name">Professor Vale</div>
          <p class="tut-text"></p>
          <div class="tut-foot">
            <span class="tut-dots"></span>
            <button class="tut-skip">Skip</button>
            <button class="pixbtn primary sm tut-next"><b>Next</b></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('.tut-skip').onclick = () => finish(true);
    root.querySelector('.tut-next').onclick = () => next();
    window.addEventListener('resize', reposition);
    if (!fromSettings) Sound.quest();
    show();
  }

  function show() {
    const st = STEPS[idx];
    if (!st) return finish(false);
    if (st.tab && UI.currentTab() !== st.tab) UI.switchTab(st.tab);
    if (st.openPanel && S.settings.panels && !S.settings.panels[st.openPanel]) {
      S.settings.panels[st.openPanel] = true;
      UI.renderMerge();
    }

    const txt = root.querySelector('.tut-text');
    txt.textContent = '';
    // type it out — the professor is talking, not printing
    let i = 0;
    clearInterval(onTab);
    onTab = setInterval(() => {
      i += 2;
      txt.textContent = st.text.slice(0, i);
      if (i >= st.text.length) clearInterval(onTab);
    }, 14);

    root.querySelector('.tut-dots').innerHTML =
      STEPS.map((_, n) => `<i class="${n === idx ? 'on' : ''}"></i>`).join('');
    const nextBtn = root.querySelector('.tut-next');
    nextBtn.querySelector('b').textContent =
      idx === STEPS.length - 1 ? 'Start' : st.wait ? 'Go on then' : 'Next';

    // a step that asks you to tap something waits for the real tap
    if (st.wait && st.wait.tab) {
      nextBtn.classList.add('ghosted');
      const check = setInterval(() => {
        if (UI.currentTab() === st.wait.tab) { clearInterval(check); nextBtn.classList.remove('ghosted'); next(); }
        if (!active) clearInterval(check);
      }, 200);
    } else {
      nextBtn.classList.remove('ghosted');
    }

    reposition();
  }

  /* cut the hole over whatever the step points at */
  function reposition() {
    if (!active || !root) return;
    const st = STEPS[idx];
    const hole = root.querySelector('.tut-hole');
    const prof = root.querySelector('.tut-prof');
    const target = st && st.where ? document.querySelector(st.where) : null;
    if (target && target.offsetParent !== null) {
      const r = target.getBoundingClientRect();
      const pad = 8;
      hole.style.opacity = '1';
      hole.style.left = (r.left - pad) + 'px';
      hole.style.top = (r.top - pad) + 'px';
      hole.style.width = (r.width + pad * 2) + 'px';
      hole.style.height = (r.height + pad * 2) + 'px';
      // put the professor on the opposite side from the highlight
      const below = r.top + r.height / 2 < window.innerHeight / 2;
      prof.classList.toggle('at-bottom', below);
      prof.classList.toggle('at-top', !below);
    } else {
      hole.style.opacity = '0';
      hole.style.width = hole.style.height = '0px';
      prof.classList.add('at-bottom');
      prof.classList.remove('at-top');
    }
  }

  function next() {
    idx++;
    if (idx >= STEPS.length) return finish(false);
    show();
  }

  function finish(skipped) {
    active = false;
    clearInterval(onTab);
    window.removeEventListener('resize', reposition);
    if (root) {
      root.classList.add('leaving');
      const r = root;
      setTimeout(() => r.remove(), 320);
      root = null;
    }
    S.tutorial = S.tutorial || {};
    S.tutorial.done = true;
    save();
    if (!skipped) {
      toast('Professor Vale: come find me in Settings any time', 'gold');
    }
  }

  /* offered once, right after onboarding */
  function maybeStart() {
    if (done() || !S.onboarded) return;
    setTimeout(() => start(false), 900);
  }

  return { start, maybeStart, done, isActive: () => active };
})();
