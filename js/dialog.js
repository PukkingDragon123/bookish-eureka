/* ============ speech: one dialogue box for the whole game ============

   Every character line in Hourling goes through here, so a conversation looks
   and behaves the same wherever it happens: a comic bubble with a tail, the
   speaker's portrait, text that types itself, and a tap anywhere to hurry it.

   A beat is { text, mood, choices }. Choices turn the beat into a real
   question — the promise resolves with the value the player picked, so a
   caller can branch on it. Without choices the beat just advances.          */
'use strict';

const Dialog = (() => {
  let root = null, typer = null, done = null;

  const MOODS = ['calm', 'up', 'think', 'cheer'];

  function speaking() { return !!root; }

  /* say([beat, …]) -> Promise resolving with the last chosen value (or null) */
  function say(beats, opts) {
    opts = opts || {};
    close();
    return new Promise(resolve => {
      let i = 0, answer = null;
      root = el('div', 'dlg-root' + (opts.veil ? ' veiled' : ''));
      // a text window, the way a pixel RPG draws one: portrait framed inside
      // the box, name on a plate notched into the top edge, choices stacked in
      // a command window above it
      root.innerHTML = `
        <div class="dlg-veil"></div>
        <div class="dlg-wrap">
          <div class="dlg-choices"></div>
          <div class="dlg-box">
            <div class="dlg-name">${opts.name || 'Professor Vale'}</div>
            <div class="dlg-inner">
              <div class="dlg-port">
                <img src="${assetUrl(opts.portrait || 'assets/ui/npc.png')}" alt="">
              </div>
              <p class="dlg-text"></p>
            </div>
            <span class="dlg-more"></span>
          </div>
        </div>`;
      document.body.appendChild(root);
      requestAnimationFrame(() => root.classList.add('in'));

      const bubble = root.querySelector('.dlg-box');
      const port = root.querySelector('.dlg-port');

      function beat() {
        const b = beats[i];
        if (!b) return finish();
        port.dataset.mood = MOODS.includes(b.mood) ? b.mood : 'calm';
        port.classList.remove('bump');
        void port.offsetWidth;
        port.classList.add('bump');
        type(b.text, () => {
          if (b.choices) showChoices(b.choices);
          else root.querySelector('.dlg-more').classList.add('on');
        });
      }

      function showChoices(list) {
        const wrap = root.querySelector('.dlg-choices');
        wrap.innerHTML = '';
        list.forEach((c, n) => {
          const b = el('button', 'dlg-choice');
          b.style.animationDelay = (n * 60) + 'ms';
          b.textContent = c.label;
          b.onclick = ev => {
            ev.stopPropagation();
            Sound.click();
            answer = c.value !== undefined ? c.value : c.label;
            wrap.innerHTML = '';
            if (c.then) { beats = c.then; i = 0; return beat(); }
            if (c.end) return finish();
            i++; beat();
          };
          wrap.appendChild(b);
        });
        wrap.classList.add('on');
      }

      function type(text, after) {
        const p = root.querySelector('.dlg-text');
        root.querySelector('.dlg-more').classList.remove('on');
        root.querySelector('.dlg-choices').classList.remove('on');
        clearInterval(typer);
        p.textContent = '';
        let n = 0;
        typer = setInterval(() => {
          n += 2;
          p.textContent = text.slice(0, n);
          if (n >= text.length) { clearInterval(typer); typer = null; after(); }
        }, 16);
        root.dataset.full = text;
        root.dataset.after = '1';
        root._after = after;
      }

      // tap anywhere on the box: finish the typing, or move to the next beat
      bubble.parentNode.onclick = ev => {
        if (ev.target.closest('.dlg-choice')) return;
        if (typer) {                                   // hurry the typewriter
          clearInterval(typer); typer = null;
          root.querySelector('.dlg-text').textContent = root.dataset.full;
          if (root._after) root._after();
          return;
        }
        if (root.querySelector('.dlg-choices').classList.contains('on')) return;
        Sound.click();
        i++; beat();
      };

      function finish() {
        close();
        resolve(answer);
      }
      done = finish;
      beat();
    });
  }

  function close() {
    clearInterval(typer); typer = null;
    if (root) {
      const r = root;
      r.classList.add('out');
      setTimeout(() => r.remove(), 260);
      root = null;
    }
    done = null;
  }

  return { say, close, speaking };
})();
