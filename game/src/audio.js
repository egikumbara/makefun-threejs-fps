// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. One shared context, one master gain, and a
// small pool of reusable nodes; nothing is created per frame, only per event.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return true;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.4;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  // A short burst of filtered noise: the crack of a shot, the thump of an explosion.
  function noise(when, duration, filterFreq, gainValue, type = 'lowpass') {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when, Math.random() * 0.2, duration);
    source.stop(when + duration + 0.05);
  }

  // A pitched blip: clicks, beeps, hit ticks and the round jingle.
  function tone(when, frequency, duration, gainValue, type = 'square') {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    shot(kind) {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      if (kind === 'rifle') {
        noise(now, 0.14, 2400, 0.9);
        tone(now, 150, 0.09, 0.5, 'sawtooth');
      } else if (kind === 'smg') {
        noise(now, 0.09, 3200, 0.6);
        tone(now, 210, 0.06, 0.35, 'sawtooth');
      } else if (kind === 'pistol') {
        noise(now, 0.11, 1800, 0.8);
        tone(now, 120, 0.08, 0.45, 'sawtooth');
      } else {
        noise(now, 0.08, 4000, 0.35, 'highpass');
      }
    },
    enemyShot(distance) {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      const volume = Math.max(0.12, 0.7 - distance * 0.014);
      noise(now, 0.12, 1600, volume);
    },
    dryFire() {
      if (!ensure() || muted) return;
      tone(context.currentTime, 900, 0.04, 0.25);
    },
    reload() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 620, 0.05, 0.3);
      tone(now + 0.22, 420, 0.05, 0.3);
      tone(now + 0.55, 780, 0.05, 0.3);
    },
    hit(kill) {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, kill ? 1560 : 1180, 0.07, 0.35, 'sine');
      if (kill) tone(now + 0.08, 1960, 0.09, 0.3, 'sine');
    },
    hurt() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 110, 0.16, 0.5, 'sawtooth');
      noise(now, 0.1, 500, 0.3);
    },
    explosion() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      noise(now, 0.9, 320, 1.0);
      tone(now, 55, 0.7, 0.7, 'sine');
      noise(now + 0.05, 0.4, 1200, 0.4, 'bandpass');
    },
    plantBeep(final) {
      if (!ensure() || muted) return;
      tone(context.currentTime, final ? 1560 : 980, final ? 0.3 : 0.1, 0.35, 'sine');
    },
    roundEnd(won) {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      const notes = won ? [523, 659, 784] : [392, 330, 262];
      for (let i = 0; i < notes.length; i += 1) tone(now + i * 0.14, notes[i], 0.22, 0.35, 'triangle');
    },
    buy() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(now, 880, 0.06, 0.3, 'sine');
      tone(now + 0.07, 1320, 0.08, 0.3, 'sine');
    },
    denied() {
      if (!ensure() || muted) return;
      tone(context.currentTime, 180, 0.15, 0.35, 'square');
    },
  };
}
