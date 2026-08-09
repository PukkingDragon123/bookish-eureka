/* ============ boot: loading screen, then the title ============

   A real game does not drop you straight into a tab. It loads with something
   to look at, then shows a title screen you choose to leave.

   The loading bar measures actual work — decoding the sprite atlases and
   fonts that are already inlined in the bundle — rather than animating a fake
   percentage. On a fast device that finishes almost immediately, so there is
   a small floor on the duration; the bar is honest about what it is waiting
   for, it just doesn't flash past.                                          */
'use strict';

const Title = (() => {
  const TIPS = [
    'Practice minutes are the only way to earn mana.',
    'Matching a beast\'s element when you feed it doubles the XP.',
    'Two of the same gear at the same tier fuse into the next one.',
    'A missed day is one day. Two in a row is a new habit.',
    'Bosses hit hardest — bring the type they are weak to.',
    'Gems buy five minutes of triple-speed combat.',
    'Your rivals are real teams, sent to you as codes by friends.',
    'Scrapping junk gear pays shards. Shards push a good piece further.',
  ];

  let onDone = null;

  /* --- loading --- */
  function boot(done) {
    onDone = done;
    try { return bootInner(); } catch (e) { return show(); }
  }

  function bootInner() {
    const b = document.getElementById('boot');
    if (!b) return show();
    b.innerHTML = `
      <div class="boot-mark">
        <img src="${assetUrl('assets/ui/app-192.png')}" alt="">
        <b>Hourling</b>
      </div>
      <div class="boot-bar"><i></i></div>
      <div class="boot-tip"></div>`;
    const fill = b.querySelector('.boot-bar i');
    const tipEl = b.querySelector('.boot-tip');
    tipEl.textContent = pick(TIPS);

    // the real work: decode every atlas the first screens will draw
    const jobs = ['assets/ui/app-192.png', 'assets/ui/npc.png', 'assets/ui/vfx.png']
      .map(assetUrl)
      .concat(S.party.slice(0, 3)
        .filter(cid => C_BY_ID[cid])
        .map(cid => assetUrl('assets/creatures/' + C_BY_ID[cid].file)));
    let loaded = 0;
    const total = jobs.length + 1;                 // +1 for fonts
    const bump = () => {
      loaded++;
      fill.style.width = Math.round((loaded / total) * 100) + '%';
    };
    jobs.forEach(src => {
      const im = new Image();
      im.onload = im.onerror = bump;
      im.src = src;
    });
    const fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
    fonts.then(bump, bump);

    const started = Date.now();
    const poll = setInterval(() => {
      const elapsed = Date.now() - started;
      // never flash past: a loading screen that blinks reads as a glitch
      if (loaded >= total && elapsed > 900) {
        clearInterval(poll);
        fill.style.width = '100%';
        setTimeout(show, 220);
      } else if (elapsed > 6000) {                 // never hang either
        clearInterval(poll);
        setTimeout(show, 100);
      }
    }, 90);
  }

  /* --- title --- */
  function show() {
    const b = document.getElementById('boot');
    if (b) b.remove();
    const hasSave = S.onboarded && S.dream && S.dream.key;
    const g = Account.googleUser();
    const prof = Account.active();

    const root = el('div', 'title-screen');
    root.innerHTML = `
      <div class="ts-sky"></div>
      <div class="ts-beast"></div>
      <div class="ts-inner">
        <div class="ts-logo">
          <img src="${assetUrl('assets/ui/app-192.png')}" alt="">
          <h1>Hourling</h1>
          <p>The hours you put in grow into something alive</p>
        </div>
        <div class="ts-actions">
          <button class="pixbtn primary ts-play"><b>${hasSave ? 'Continue' : 'New game'}</b></button>
          ${hasSave ? '<button class="pixbtn ghost sm ts-profiles">Switch profile</button>' : ''}
          <button class="pixbtn ghost sm ts-account">${g ? g.name || g.email : 'Sign in'}</button>
        </div>
        <div class="ts-foot">
          <span>${hasSave ? `${prof.name} · Lv.${S.player.level} · ${Dream.def() ? Dream.def().name : ''}` : 'No save on this device yet'}</span>
          <span class="ts-ver">v5</span>
        </div>
      </div>`;
    document.body.appendChild(root);

    const beast = root.querySelector('.ts-beast');
    const cid = S.starterCid || S.party[0];
    if (cid && C_BY_ID[cid]) {
      const img = el('img');
      img.src = assetUrl('assets/creatures/' + C_BY_ID[cid].file);
      beast.appendChild(img);
    }

    const leave = () => {
      root.classList.add('leaving');
      setTimeout(() => root.remove(), 420);
      Sound.click();
      if (onDone) { const f = onDone; onDone = null; f(); }
    };
    root.querySelector('.ts-play').onclick = leave;
    const ac = root.querySelector('.ts-account');
    if (ac) ac.onclick = () => UI.showAccount();
    const pr = root.querySelector('.ts-profiles');
    if (pr) pr.onclick = () => UI.showAccount();
  }

  return { boot };
})();
