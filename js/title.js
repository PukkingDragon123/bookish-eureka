/* ============ boot: a loading screen, then sign-in ============

   There is no main menu. A phone game that makes you tap "Play" before it will
   start is wasting a tap, so the loading screen hands straight over: either to
   the sign-in card (once) or to the game itself.

   The loading bar measures actual work — decoding the sprite atlases and fonts
   that are already inlined in the bundle — rather than animating a fake
   percentage. On a fast device that finishes almost immediately, so there is a
   small floor on the duration; it is honest about what it waits for, it just
   doesn't flash past.

   The sign-in card is deliberately narrow about what it claims. Signing in with
   Google is identity only (see account.js) so it cannot promise sync, and it
   says so in one line. The reward for signing in is real, because gems are
   local anyway. Restoring a backup code is the one thing here that genuinely
   moves a save between devices, so it sits on the same card.               */
'use strict';

const Title = (() => {
  const TIPS = [
    'Practice minutes are the only way to earn mana.',
    'Feed a beast its own element and the XP doubles.',
    'Two of the same gear at the same tier fuse into the next one.',
    'A missed day is one day. Two in a row is a new habit.',
    'Bosses hit hardest — bring the type they are weak to.',
    'Gems buy five minutes of triple-speed combat.',
    'Rivals are real teams, sent to you as codes by friends.',
    'Scrapping junk gear pays shards. Shards push a good piece further.',
  ];
  const SIGNIN_GEMS = 150;

  let onDone = null;

  /* ---------------- loading ---------------- */
  function boot(done) {
    onDone = done;
    try { return bootInner(); } catch (e) { return afterLoad(); }
  }

  /* the loading screen shows your own starter once you have one; before that
     it shows the mascot rather than the app icon, which does not bounce well */
  const MASCOT = 'assets/creatures/s17_02.png';
  function beastFile() {
    const cid = S.starterCid || S.party[0];
    return cid && C_BY_ID[cid] ? 'assets/creatures/' + C_BY_ID[cid].file : MASCOT;
  }

  function bootInner() {
    const b = document.getElementById('boot');
    if (!b) return afterLoad();
    b.innerHTML = `
      <div class="boot-stage">
        <div class="boot-spark"></div>
        <img class="boot-beast" src="${assetUrl(beastFile())}" alt="">
        <span class="boot-shadow"></span>
      </div>
      <b class="boot-name">Hourling</b>
      <div class="boot-bar"><i></i></div>
      <div class="boot-tip"></div>`;
    const fill = b.querySelector('.boot-bar i');
    b.querySelector('.boot-tip').textContent = pick(TIPS);

    // the real work: decode every atlas the first screens will draw
    const jobs = ['assets/ui/app-192.png', 'assets/ui/npc.png', 'assets/ui/vfx.png', beastFile()]
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
      if (loaded >= total && elapsed > 1100) {
        clearInterval(poll);
        fill.style.width = '100%';
        setTimeout(afterLoad, 260);
      } else if (elapsed > 6000) {                 // never hang either
        clearInterval(poll);
        setTimeout(afterLoad, 100);
      }
    }, 90);
  }

  function clearBoot() {
    const b = document.getElementById('boot');
    if (!b) return;
    b.classList.add('gone');
    setTimeout(() => b.remove(), 420);
  }

  /* ---------------- hand-off ---------------- */
  function afterLoad() {
    if (needsSignIn()) return showSignIn();
    clearBoot();
    finish();
  }

  function needsSignIn() {
    if (Account.googleUser()) return false;         // already signed in
    return !(S.settings && S.settings.signinSkipped);
  }

  function finish() {
    if (!onDone) return;
    const f = onDone;
    onDone = null;
    f();
  }

  /* ---------------- sign-in ---------------- */
  function showSignIn() {
    const root = el('div', 'signin');
    const profs = Account.profiles();
    const paid = !!(S.settings && S.settings.signinPaid);
    root.innerHTML = `
      <div class="si-sky"></div>
      <div class="si-card">
        <img class="si-mark" src="${assetUrl('assets/ui/app-192.png')}" alt="">
        <h1>Hourling</h1>
        <p class="si-sub">${paid ? 'Sign back in, or carry on.' : 'Sign in to claim your welcome gems.'}</p>

        ${paid ? '' : `<div class="si-reward">${icon('gem')}<b>${SIGNIN_GEMS}</b><span>welcome bonus</span></div>`}

        <div class="si-google"></div>
        <div class="si-status"></div>

        <button class="pixbtn primary si-guest"><b>Continue without an account</b></button>

        <div class="si-alt">
          <button class="linkbtn" data-si="code">I have a backup code</button>
          ${profs.length > 1 ? '<button class="linkbtn" data-si="prof">Switch profile</button>' : ''}
        </div>

        <p class="si-fine">No server here: signing in shows your name and pays the
          gems. Your save lives in this browser — a backup code is how it moves.</p>
      </div>`;
    document.body.appendChild(root);
    clearBoot();
    requestAnimationFrame(() => root.classList.add('in'));

    const status = root.querySelector('.si-status');
    const host = root.querySelector('.si-google');

    Account.mountButton(host).then(res => {
      if (res === 'ok') { status.textContent = ''; return; }
      // no client ID / file:// / blocked: say which, and offer the real fix
      host.innerHTML = `<button class="pixbtn ghost wide" data-si="setup">
        <b>Set up Google sign-in</b></button>`;
      status.textContent = {
        'no-client': 'Google sign-in needs your own client ID.',
        file: 'Google sign-in cannot run from a local file.',
        blocked: 'Google sign-in did not load on this connection.',
      }[res] || 'Google sign-in is unavailable here.';
      host.querySelector('[data-si="setup"]').onclick = () => {
        Sound.click();
        leave(() => { finish(); UI.showAccount(); });
      };
    });

    // GIS calls back into Account, not into us, so watch for the result
    const watch = setInterval(() => {
      if (!Account.googleUser()) return;
      clearInterval(watch);
      grantSigninBonus();
      leave(finish);
    }, 400);

    root.querySelector('.si-guest').onclick = () => {
      Sound.click();
      S.settings.signinSkipped = true;
      save();
      clearInterval(watch);
      leave(finish);
    };
    root.querySelectorAll('[data-si]').forEach(b => {
      if (b.dataset.si === 'setup') return;
      b.onclick = () => {
        Sound.click();
        clearInterval(watch);
        S.settings.signinSkipped = true;
        save();
        const which = b.dataset.si;
        leave(() => {
          finish();
          if (which === 'code') UI.showRestore();
          else UI.showAccount();
        });
      };
    });

    function leave(then) {
      root.classList.add('out');
      setTimeout(() => root.remove(), 320);
      setTimeout(then, 180);
    }
  }

  /* paid once, ever — signing out and back in does not re-pay */
  function grantSigninBonus() {
    if (S.settings.signinPaid) return;
    S.settings.signinPaid = true;
    S.settings.signinSkipped = true;
    S.player.gems += SIGNIN_GEMS;
    save();
    Sound.coin();
    toast(`Welcome — ${SIGNIN_GEMS} gems added`, 'gold');
  }

  return { boot, grantSigninBonus, SIGNIN_GEMS };
})();
