/* ============ boot ============

   One screen before the game: a loading screen that hands straight over. No
   main menu, no sign-in, nothing to tap through.

   The bar measures actual work — decoding the sprite atlases and fonts already
   inlined in the bundle — rather than animating a fake percentage. On a fast
   device that finishes almost at once, so there is a small floor on it; the bar
   is honest about what it waits for, it just doesn't flash past.           */
'use strict';

const Title = (() => {
  const TIPS = [
    'Mana comes from practice. Nothing else makes it.',
    'Feed a beast its own element for double XP.',
    'Two of the same gear, same tier, fuse into the next one.',
    'A missed day is one day. Two in a row is a habit.',
    'Bosses hit hard. Bring the type they are weak to.',
    'Gems buy five minutes of triple-speed combat.',
    'Rival codes let you fight a friend\'s team.',
    'Scrap junk gear for shards. Shards push a good piece further.',
    'Watering the garden is free. Practice does it for you.',
    'Type advantage beats levels more often than you would think.',
  ];
  const GIFT_GEMS = 150;

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
    clearBoot();
    gift();
    finish();
  }

  /* The old sign-in card paid gems for signing in. There is no sign-in now, so
     the gems are simply a gift on the first launch — same value, one fewer
     screen, and nothing to click through. */
  function gift() {
    if (S.settings.welcomed) return;
    S.settings.welcomed = true;
    S.player.gems += GIFT_GEMS;
    save();
    setTimeout(() => {
      Sound.coin();
      toast(`Welcome gift: ${GIFT_GEMS} gems`, 'gold');
    }, 900);
  }

  function finish() {
    if (!onDone) return;
    const f = onDone;
    onDone = null;
    f();
  }

  return { boot };
})();
