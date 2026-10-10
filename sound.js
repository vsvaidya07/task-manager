// sound.js: sound effects generated with the Web Audio API (no audio files needed)
const Sound = (function () {
  const MUTE_KEY = "taskManager.muted";
  let actx = null;
  let master = null;
  let muted = false;

  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (err) {
    // storage unavailable, sound stays on
  }

  // ----- Audio context (browsers only allow sound after a click or key press) -----
  function ensureContext() {
    if (actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      actx = new AC();
      const compressor = actx.createDynamicsCompressor(); // stops overlapping sounds from clipping
      master = actx.createGain();
      master.gain.value = 0.4; // overall volume
      master.connect(compressor);
      compressor.connect(actx.destination);
    } catch (err) {
      actx = null;
    }
    return actx;
  }

  function unlock() {
    const c = ensureContext();
    if (c && c.state === "suspended") {
      const p = c.resume();
      if (p && p.catch) p.catch(function () {});
    }
  }

  // ----- Building blocks -----
  // One note: oscillator + volume envelope (+ optional low-pass filter and pitch slide)
  function tone(o) {
    const t0 = actx.currentTime + (o.start || 0);
    const dur = o.dur || 0.15;
    const attack = Math.min(o.attack || 0.005, dur * 0.5);
    const osc = actx.createOscillator();
    const env = actx.createGain();

    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(o.gain || 0.3, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let last = osc;
    if (o.cutoff) {
      const filter = actx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = o.cutoff;
      osc.connect(filter);
      last = filter;
    }
    last.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A burst of filtered noise: whooshes, rumbles and impacts
  function noise(o) {
    const t0 = actx.currentTime + (o.start || 0);
    const dur = o.dur || 0.5;
    const attack = Math.min(o.attack || dur * 0.3, dur * 0.9);
    const length = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buffer = actx.createBuffer(1, length, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const src = actx.createBufferSource();
    src.buffer = buffer;

    const filter = actx.createBiquadFilter();
    filter.type = o.filter || "lowpass";
    filter.frequency.setValueAtTime(o.from || 400, t0);
    filter.frequency.exponentialRampToValueAtTime(o.to || 2000, t0 + dur);

    const env = actx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(o.gain || 0.2, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ----- The sounds -----
  const sounds = {
    // tiny UI tick (filters, sound toggle)
    tick: function () {
      tone({ freq: 900, dur: 0.04, gain: 0.12 });
    },

    // task added: soft two-note blip
    add: function () {
      tone({ freq: 660, dur: 0.09, gain: 0.22, type: "triangle" });
      tone({ freq: 990, start: 0.07, dur: 0.14, gain: 0.22, type: "triangle" });
    },

    // task cleared: bright chime
    clear: function () {
      tone({ freq: 784, dur: 0.14, gain: 0.28, type: "triangle" });
      tone({ freq: 1175, start: 0.08, dur: 0.3, gain: 0.3 });
      tone({ freq: 2350, start: 0.08, dur: 0.2, gain: 0.06 });
    },

    // task un-checked: short low blip
    uncheck: function () {
      tone({ freq: 520, dur: 0.08, gain: 0.18, type: "triangle" });
    },

    // task deleted: falling blip
    delete: function () {
      tone({ freq: 380, slideTo: 170, dur: 0.2, gain: 0.25, type: "triangle" });
    },

    // empty task blocked: dull buzz
    error: function () {
      tone({ freq: 170, dur: 0.16, gain: 0.22, type: "sawtooth", cutoff: 900 });
      tone({ freq: 135, start: 0.12, dur: 0.22, gain: 0.22, type: "sawtooth", cutoff: 900 });
    },

    // ability point spent: digital tick-tick
    stat: function () {
      tone({ freq: 1200, dur: 0.04, gain: 0.14, type: "square", cutoff: 3000 });
      tone({ freq: 1700, start: 0.045, dur: 0.07, gain: 0.14, type: "square", cutoff: 3000 });
    },

    // System notification: glassy double ping
    ding: function () {
      tone({ freq: 1047, dur: 0.55, gain: 0.28 });
      tone({ freq: 1568, start: 0.09, dur: 0.7, gain: 0.22 });
      tone({ freq: 3136, start: 0.09, dur: 0.3, gain: 0.05 });
    },

    // new title: rising sparkle
    title: function () {
      [1047, 1319, 1568, 2093].forEach(function (f, i) {
        tone({ freq: f, start: i * 0.07, dur: 0.25, gain: 0.2, type: "triangle" });
      });
      tone({ freq: 2093, start: 0.28, dur: 0.6, gain: 0.18 });
    },

    // daily quest complete: short triumphant run
    daily: function () {
      [523, 659, 784].forEach(function (f, i) {
        tone({ freq: f, start: i * 0.1, dur: 0.2, gain: 0.26, type: "triangle" });
      });
      tone({ freq: 1047, start: 0.3, dur: 0.7, gain: 0.3 });
      tone({ freq: 784, start: 0.3, dur: 0.7, gain: 0.18, type: "triangle" });
    },

    // level up: power-up sweep, arpeggio, shimmering chord
    levelup: function () {
      noise({ dur: 0.45, gain: 0.12, from: 300, to: 6000, filter: "bandpass" });
      tone({ freq: 220, slideTo: 880, dur: 0.4, gain: 0.18, type: "sawtooth", cutoff: 2500 });
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone({ freq: f, start: 0.35 + i * 0.08, dur: 0.25, gain: 0.26, type: "triangle" });
      });
      [1047, 1319, 1568].forEach(function (f) {
        tone({ freq: f, start: 0.8, dur: 1.0, gain: 0.2 });
      });
    },

    // rank up: three-step fanfare
    rankup: function () {
      const chords = [
        { t: 0, d: 0.3, notes: [392, 494, 587] },
        { t: 0.25, d: 0.3, notes: [523, 659, 784] },
        { t: 0.55, d: 1.2, notes: [659, 784, 1047] },
      ];
      chords.forEach(function (c) {
        c.notes.forEach(function (f) {
          tone({ freq: f, start: c.t, dur: c.d, gain: 0.2, type: "triangle" });
        });
      });
      tone({ freq: 196, dur: 1.7, gain: 0.25 });
      tone({ freq: 2093, start: 0.55, dur: 1.2, gain: 0.1 });
    },

    // ARISE: dark rumbling swell, then a heavy hit
    arise: function () {
      noise({ dur: 1.6, gain: 0.32, from: 60, to: 500, attack: 1.2 });
      tone({ freq: 55, slideTo: 110, dur: 1.7, gain: 0.2, type: "sawtooth", cutoff: 300, attack: 1.2 });
      tone({ freq: 220, dur: 1.6, gain: 0.1, attack: 1.0 });
      tone({ freq: 330, start: 0.2, dur: 1.5, gain: 0.08, attack: 1.0 });
      tone({ freq: 90, slideTo: 40, start: 1.45, dur: 1.2, gain: 0.5 });
      noise({ start: 1.45, dur: 0.8, gain: 0.3, from: 2000, to: 100, attack: 0.01 });
      tone({ freq: 440, start: 1.45, dur: 1.6, gain: 0.12 });
    },
  };

  // ----- Public API -----
  function play(name) {
    if (muted || !sounds[name]) return;
    const c = ensureContext();
    if (!c || c.state !== "running") return; // not unlocked yet: stay silent
    try {
      sounds[name]();
    } catch (err) {
      // never let a sound problem break the app
    }
  }

  function setMuted(value) {
    muted = !!value;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (err) {
      // ignore
    }
  }

  function isMuted() {
    return muted;
  }

  return { play: play, setMuted: setMuted, isMuted: isMuted, unlock: unlock, names: Object.keys(sounds) };
})();
