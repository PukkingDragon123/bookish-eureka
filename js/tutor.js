/* ============ Professor Vale — the guided first run ============

   Not a wall of text with a Next button. Each step dims the screen except one
   real element, Vale points at it, and steps that ask you to do something wait
   for you to actually do it.

   Two routes: the full tour, or the short one for people who have played a
   game before. The player picks at the first beat, so the guide is a
   conversation from the first tap rather than a slideshow.                  */
'use strict';

const Tutor = (() => {
  /* where: selector to spotlight  ·  tab: switch here first
     wait: { tab } — advances on the real tap, not on Next
     ask:  [{ label, go }] — branch: jump to that step key             */
  const STEPS = [
    { key: 'hi', tab: 'today', where: null, mood: 'up',
      text: "I'm Vale. I study what people become when they keep showing up.",
      ask: [{ label: 'Show me around', go: 'ladder' },
            { label: "I've got this — the short version", go: 'mana' }] },

    { key: 'ladder', tab: 'today', where: '#today-hero', mood: 'think',
      text: 'Your dream, and ten rungs under it. Only practised hours move it.' },

    { key: 'focus', tab: 'today', where: '#focus-card',
      text: 'One task a day. Not "practise more" — one thing, with a timer.' },

    { key: 'mana', tab: 'today', where: '.mana-chip', mood: 'up',
      text: 'Minutes become mana. Everything else in here runs on it.' },

    { key: 'go', tab: 'today', where: '#tabbar button[data-tab="battle"]', mood: 'cheer',
      text: 'Your beasts fight without you. Tap Battle.',
      wait: { tab: 'battle' } },

    { key: 'scene', tab: 'battle', where: '#scene',
      text: 'Slow and steady, whether or not you watch. Come back after a session.' },

    { key: 'haste', tab: 'battle', where: '#haste-btn', mood: 'think',
      text: 'Gems buy five minutes of triple speed. Never necessary.' },

    { key: 'forge', tab: 'battle', where: '#merge-panel', openPanel: 'fusion',
      text: 'Drag two matching pieces together. Every piece buffs the party.' },

    { key: 'quests', tab: 'quests', where: '#quest-list', mood: 'up',
      text: 'Real habits, real rewards. This is where gems come from.' },

    { key: 'end', tab: 'today', where: null, mood: 'cheer',
      text: "That's it. One real session today and the rest follows." },
  ];
  const AT = {};
  STEPS.forEach((s, i) => { AT[s.key] = i; });

  let idx = 0, active = false, root = null, typer = null, watcher = null, full = '';

  function done() { return !!(S.tutorial && S.tutorial.done); }

  function start(fromSettings) {
    if (active) return;
    try { closeAllModals(); } catch (e) {}
    active = true;
    idx = 0;
    root = el('div', 'tut-root');
    root.innerHTML = `
      <div class="tut-veil"><div class="tut-hole"></div></div>
      <div class="tut-prof">
        <img class="tut-sprite" src="${assetUrl('assets/ui/npc.png')}" alt="Professor Vale">
        <div class="tut-bubble">
          <span class="dlg-tail"></span>
          <div class="tut-name">Professor Vale</div>
          <p class="tut-text"></p>
          <div class="dlg-choices"></div>
          <div class="tut-foot">
            <span class="tut-dots"></span>
            <button class="tut-skip">Skip</button>
            <button class="pixbtn primary sm tut-next"><b>Next</b></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('.tut-skip').onclick = e => { e.stopPropagation(); finish(true); };
    root.querySelector('.tut-next').onclick = e => { e.stopPropagation(); advance(); };
    // tapping the bubble hurries the typing, then moves on
    root.querySelector('.tut-bubble').onclick = e => {
      if (e.target.closest('button')) return;
      if (typer) return hurry();
      if (!root.querySelector('.dlg-choices').classList.contains('on')) advance();
    };
    window.addEventListener('resize', reposition);
    if (!fromSettings) Sound.quest();
    show();
  }

  function hurry() {
    clearInterval(typer); typer = null;
    root.querySelector('.tut-text').textContent = full;
    reveal();
  }

  /* what appears once the line has finished typing */
  function reveal() {
    const st = STEPS[idx];
    const ch = root.querySelector('.dlg-choices');
    const nextBtn = root.querySelector('.tut-next');
    if (st.ask) {
      ch.innerHTML = '';
      st.ask.forEach((a, n) => {
        const b = el('button', 'dlg-choice');
        b.style.animationDelay = (n * 70) + 'ms';
        b.textContent = a.label;
        b.onclick = ev => {
          ev.stopPropagation();
          Sound.click();
          ch.classList.remove('on');
          idx = AT[a.go] != null ? AT[a.go] : idx + 1;
          show();
        };
        ch.appendChild(b);
      });
      ch.classList.add('on');
      nextBtn.style.display = 'none';
    } else {
      ch.classList.remove('on');
      nextBtn.style.display = '';
    }
  }

  function show() {
    const st = STEPS[idx];
    if (!st) return finish(false);
    if (st.tab && UI.currentTab() !== st.tab) UI.switchTab(st.tab);
    if (st.openPanel && S.settings.panels && !S.settings.panels[st.openPanel]) {
      S.settings.panels[st.openPanel] = true;
      UI.renderMerge();
    }

    const prof = root.querySelector('.tut-prof');
    prof.dataset.mood = st.mood || 'calm';
    const sprite = root.querySelector('.tut-sprite');
    sprite.style.animation = 'none';
    void sprite.offsetWidth;
    sprite.style.animation = '';

    const txt = root.querySelector('.tut-text');
    full = st.text;
    txt.textContent = '';
    root.querySelector('.dlg-choices').classList.remove('on');
    let i = 0;
    clearInterval(typer);
    typer = setInterval(() => {
      i += 2;
      txt.textContent = full.slice(0, i);
      if (i >= full.length) { clearInterval(typer); typer = null; reveal(); }
    }, 15);

    root.querySelector('.tut-dots').innerHTML =
      STEPS.map((_, n) => `<i class="${n === idx ? 'on' : ''}"></i>`).join('');
    const nextBtn = root.querySelector('.tut-next');
    nextBtn.querySelector('b').textContent =
      idx === STEPS.length - 1 ? 'Start' : st.wait ? 'Go on' : 'Next';

    clearInterval(watcher);
    if (st.wait && st.wait.tab) {
      nextBtn.classList.add('ghosted');
      watcher = setInterval(() => {
        if (!active) return clearInterval(watcher);
        if (UI.currentTab() === st.wait.tab) {
          clearInterval(watcher);
          nextBtn.classList.remove('ghosted');
          advance();
        }
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

  function advance() {
    idx++;
    if (idx >= STEPS.length) return finish(false);
    show();
  }

  function finish(skipped) {
    active = false;
    clearInterval(typer); typer = null;
    clearInterval(watcher);
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
    if (!skipped) toast('Vale is in Settings if you want him again', 'gold');
  }

  /* offered once, right after onboarding */
  function maybeStart() {
    if (done() || !S.onboarded) return;
    setTimeout(() => start(false), 900);
  }

  return { start, maybeStart, done, isActive: () => active };
})();
