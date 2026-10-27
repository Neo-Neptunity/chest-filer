// 小さな効果音。WebAudio で、その場で作る。音は小さめ。

export function createAudio() {
  let ctx = null;
  let enabled = true;

  const get = () => {
    if (!enabled) return null;
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };

  function tone(freq, dur, { type = "square", vol = 0.04, to = freq, delay = 0, lp = 0 } = {}) {
    const c = get();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (lp) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, { vol = 0.05, lp = 800, delay = 0 } = {}) {
    const c = get();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination);
    s.start(t0);
  }

  const SOUNDS = {
    open() { tone(120, 0.3, { type: "sawtooth", to: 70, vol: 0.035, lp: 520 }); noise(0.12, { vol: 0.025, lp: 600 }); },
    close() { tone(95, 0.16, { type: "sine", to: 48, vol: 0.07 }); noise(0.1, { vol: 0.05, lp: 320 }); },
    pick() { tone(640, 0.035, { vol: 0.03 }); },
    drop() { tone(300, 0.08, { type: "sine", to: 720, vol: 0.06 }); },
    move() { tone(420, 0.06, { type: "triangle", to: 540, vol: 0.05 }); },
    error() { tone(130, 0.1, { vol: 0.045 }); tone(110, 0.12, { vol: 0.045, delay: 0.12 }); },
    make() { tone(330, 0.1, { type: "triangle", to: 495, vol: 0.05 }); tone(660, 0.14, { type: "triangle", vol: 0.04, delay: 0.1 }); },
    undo() { tone(520, 0.1, { type: "sine", to: 340, vol: 0.05 }); },
    step() { noise(0.045, { vol: 0.028, lp: 520 }); },
    break() { noise(0.2, { vol: 0.07, lp: 900 }); tone(180, 0.16, { type: "sawtooth", to: 60, vol: 0.04 }); },
  };

  return {
    play(name) { try { (SOUNDS[name] || (() => {}))(); } catch { /* 音が出なくても困らない */ } },
    setEnabled(v) { enabled = !!v; },
    names: Object.keys(SOUNDS),
  };
}
