// Sound, synthesised with WebAudio: no audio files to ship, and every effect is
// a few oscillators and noise bursts shaped by envelopes. Created lazily on the
// first user gesture, so browsers that block autoplay stay quiet until play.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.08, frequency = 1200, gain = 0.5, type = 'lowpass' }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone({ frequency = 440, to = null, duration = 0.12, gain = 0.25, type = 'sine' }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shoot(kind) {
      if (kind === 'sniper') burst({ duration: 0.22, frequency: 900, gain: 0.7 });
      else if (kind === 'smg') burst({ duration: 0.05, frequency: 1600, gain: 0.35 });
      else if (kind === 'pistol') burst({ duration: 0.07, frequency: 1400, gain: 0.45 });
      else burst({ duration: 0.1, frequency: 1100, gain: 0.55 });
      tone({ frequency: 180, to: 60, duration: 0.09, gain: 0.3, type: 'square' });
    },
    enemyShoot(distance) {
      const gain = Math.max(0.05, 0.35 - distance * 0.012);
      burst({ duration: 0.08, frequency: 1000, gain });
    },
    hit() {
      tone({ frequency: 1250, duration: 0.05, gain: 0.3, type: 'square' });
    },
    kill() {
      tone({ frequency: 880, to: 1320, duration: 0.12, gain: 0.3, type: 'square' });
    },
    hurt() {
      tone({ frequency: 220, to: 110, duration: 0.15, gain: 0.3, type: 'sawtooth' });
    },
    reload() {
      tone({ frequency: 500, duration: 0.05, gain: 0.2, type: 'square' });
      setTimeout(() => tone({ frequency: 700, duration: 0.05, gain: 0.2, type: 'square' }), 120);
    },
    buy() {
      tone({ frequency: 660, duration: 0.07, gain: 0.25 });
      setTimeout(() => tone({ frequency: 990, duration: 0.09, gain: 0.25 }), 80);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone({ frequency: f, duration: 0.16, gain: 0.3 }), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ frequency: f, duration: 0.18, gain: 0.25 }), i * 140));
    },
    captureTick() {
      tone({ frequency: 980, duration: 0.04, gain: 0.15, type: 'square' });
    },
    click() {
      tone({ frequency: 800, duration: 0.04, gain: 0.2, type: 'square' });
    },
  };
}
