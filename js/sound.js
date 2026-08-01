/* ============ Ritual Beasts — WebAudio synth (no external assets) ============ */
'use strict';

const Sound = (() => {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slide) {
    const a = ac();
    if (!a || !enabled) return;
    const t0 = a.currentTime + (when || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.08, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, when) {
    const a = ac();
    if (!a || !enabled) return;
    const t0 = a.currentTime + (when || 0);
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.setValueAtTime(vol || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    const f = a.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
  }

  return {
    setEnabled(v) { enabled = v; },
    get enabled() { return enabled; },
    click() { tone(660, 0.05, 'square', 0.04); },
    hit() { noise(0.07, 0.035); tone(160, 0.06, 'sawtooth', 0.03, 0, -60); },
    kill() { tone(520, 0.07, 'square', 0.05); tone(780, 0.09, 'square', 0.045, 0.06); },
    coin() { tone(988, 0.06, 'square', 0.045); tone(1319, 0.10, 'square', 0.04, 0.055); },
    habit() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, i * 0.07)); },
    quest() { [587, 740, 880, 1175].forEach((f, i) => tone(f, 0.14, 'triangle', 0.06, i * 0.08)); },
    levelup() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.09)); },
    summon() { noise(0.3, 0.03); [330, 415, 494, 659, 831].forEach((f, i) => tone(f, 0.22, 'sine', 0.06, 0.15 + i * 0.09)); },
    evolve() { [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, i * 0.11)); noise(0.5, 0.02, 0.5); },
    boss() { tone(110, 0.4, 'sawtooth', 0.06, 0, -30); tone(165, 0.4, 'sawtooth', 0.05, 0.18, -40); },
    fail() { tone(330, 0.18, 'sawtooth', 0.05, 0, -110); tone(220, 0.26, 'sawtooth', 0.05, 0.14, -80); },
    timerDone() { [880, 880, 1175].forEach((f, i) => tone(f, 0.16, 'square', 0.07, i * 0.18)); },
  };
})();
