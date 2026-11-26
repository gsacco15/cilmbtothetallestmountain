// All sounds are made on the fly with the Web Audio API, so there are no
// sound files to download.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.birdT = 2;
    this.cricketT = 0;
    this.crackleT = 0;
    this.heartT = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Wind: filtered noise that grows louder as you climb
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, slide = null, delay = 0, attack = 0.01, vibrato = 0, vibRate = 6 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = vibRate;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.2, slide = null, delay = 0, attack = 0.005, am = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (am) {
      const amg = ctx.createGain();
      amg.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = am;
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(amg.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      g.connect(amg);
      out = amg;
    }
    s.connect(f).connect(g);
    out.connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(name, opt = {}) {
    if (!this.ready) return;
    switch (name) {
      case 'step': {
        const surf = opt.surface || 'grass';
        const freq = surf === 'snow' ? 2600 : surf === 'rock' ? 700 : 1200;
        this.noise(0.08, { freq, q: 0.9, gain: surf === 'snow' ? 0.07 : 0.05, type: 'bandpass' });
        break;
      }
      case 'swing':
        this.noise(0.24, { freq: 500, slide: 2400, q: 1.6, gain: 0.16 });
        break;
      case 'thwack':
        this.tone(150, 0.14, { type: 'square', gain: 0.16, slide: 60 });
        this.noise(0.1, { freq: 900, q: 0.8, gain: 0.25 });
        break;
      case 'hurt':
        this.tone(320, 0.28, { type: 'sawtooth', gain: 0.14, slide: 110 });
        this.noise(0.15, { type: 'lowpass', freq: 500, gain: 0.3 });
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(0.06, { type: 'lowpass', freq: 1800, gain: 0.18, delay: i * 0.11 });
        break;
      case 'drink':
        this.tone(520, 0.12, { gain: 0.16, slide: 300 });
        this.tone(480, 0.12, { gain: 0.14, slide: 280, delay: 0.17 });
        break;
      case 'snow':
        this.noise(0.25, { freq: 3000, q: 0.6, gain: 0.12 });
        break;
      case 'pickup':
        this.tone(660, 0.12, { type: 'triangle', gain: 0.18 });
        this.tone(990, 0.18, { type: 'triangle', gain: 0.16, delay: 0.09 });
        break;
      case 'crate':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', gain: 0.16, delay: i * 0.08 }));
        break;
      case 'camp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', gain: 0.17, delay: i * 0.12 }));
        break;
      case 'sick':
        this.tone(220, 0.6, { type: 'sine', gain: 0.18, slide: 140, vibrato: 30, vibRate: 7 });
        break;
      case 'growl':
        this.tone(85, 0.9, { type: 'sawtooth', gain: 0.18, slide: 70, vibrato: 12, vibRate: 11, attack: 0.08 });
        break;
      case 'howl':
        this.tone(380, 1.6, { type: 'sine', gain: 0.12, slide: 640, vibrato: 10, vibRate: 5, attack: 0.25 });
        break;
      case 'rattle':
        this.noise(0.9, { type: 'highpass', freq: 3500, gain: 0.16, am: 28 });
        break;
      case 'screech':
        this.tone(2100, 0.55, { type: 'sawtooth', gain: 0.07, slide: 1300, vibrato: 60, vibRate: 18 });
        break;
      case 'bleat':
        this.tone(330, 0.5, { type: 'square', gain: 0.08, slide: 300, vibrato: 25, vibRate: 9 });
        break;
      case 'roar':
        this.tone(170, 0.6, { type: 'sawtooth', gain: 0.15, slide: 85, vibrato: 14, vibRate: 13, attack: 0.04 });
        break;
      case 'scared':
        this.tone(700, 0.18, { type: 'triangle', gain: 0.14, slide: 1200 });
        break;
      case 'death':
        [440, 349, 262, 196].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', gain: 0.2, delay: i * 0.28 }));
        break;
      case 'win':
        [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.7], [1047, 0.85], [1319, 1.05]].forEach(([f, d]) => {
          this.tone(f, 0.5, { type: 'triangle', gain: 0.2, delay: d });
          this.tone(f / 2, 0.5, { type: 'square', gain: 0.05, delay: d });
        });
        break;
      case 'honk':
        this.tone(370, 0.5, { type: 'square', gain: 0.12 });
        this.tone(440, 0.5, { type: 'square', gain: 0.1 });
        break;
      case 'sleep':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.6, { type: 'sine', gain: 0.15, delay: i * 0.3 }));
        break;
      case 'jump':
        this.noise(0.1, { type: 'lowpass', freq: 600, gain: 0.1 });
        break;
      case 'click':
        this.tone(880, 0.06, { type: 'triangle', gain: 0.08 });
        break;
      case 'box':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, { type: 'square', gain: 0.06, delay: i * 0.06 }));
        break;
      case 'spray':
        this.noise(0.7, { type: 'highpass', freq: 3000, gain: 0.2, attack: 0.02 });
        break;
      case 'slip':
        this.tone(1400, 0.6, { type: 'sine', gain: 0.12, slide: 300 });
        break;
      case 'squawk':
        this.tone(950, 0.45, { type: 'square', gain: 0.12, slide: 620, vibrato: 90, vibRate: 22 });
        this.tone(700, 0.3, { type: 'sawtooth', gain: 0.06, slide: 500, delay: 0.05 });
        break;
      case 'heartbeat':
        for (let i = 0; i < 3; i++) {
          this.tone(70, 0.12, { gain: 0.3, slide: 50, delay: i * 0.7 });
          this.tone(64, 0.12, { gain: 0.24, slide: 46, delay: i * 0.7 + 0.2 });
        }
        break;
      case 'pfft':
        this.noise(0.9, { type: 'lowpass', freq: 380, gain: 0.35, slide: 160, am: 38 });
        this.tone(110, 0.8, { type: 'sawtooth', gain: 0.06, slide: 70, vibrato: 18, vibRate: 30 });
        break;
      case 'bonk':
        this.tone(620, 0.4, { type: 'triangle', gain: 0.22, slide: 560 });
        this.tone(1240, 0.3, { type: 'sine', gain: 0.08 });
        this.noise(0.08, { freq: 2000, gain: 0.2 });
        break;
      case 'pop':
        this.noise(0.12, { type: 'highpass', freq: 1200, gain: 0.35 });
        [1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', gain: 0.1, delay: 0.1 + i * 0.07 }));
        break;
      case 'bubble':
        for (let i = 0; i < 6; i++) this.noise(0.04, { type: 'highpass', freq: 1800, gain: 0.25, delay: i * 0.09 + Math.random() * 0.04 });
        break;
      case 'whee':
        this.tone(400, 0.6, { type: 'sine', gain: 0.12, slide: 1400 });
        break;
      case 'sizzle':
        this.noise(0.8, { type: 'highpass', freq: 4000, gain: 0.12 });
        this.tone(300, 0.4, { type: 'sawtooth', gain: 0.05, slide: 900 });
        break;
      case 'umbrella':
        this.noise(0.15, { type: 'bandpass', freq: 900, gain: 0.2 });
        this.tone(500, 0.12, { type: 'triangle', gain: 0.1, delay: 0.05 });
        break;
      case 'flush':
        this.noise(1.6, { type: 'bandpass', freq: 600, q: 0.6, gain: 0.3, slide: 250, attack: 0.1 });
        break;
      case 'block':
        this.tone(300, 0.15, { type: 'square', gain: 0.1 });
        this.noise(0.12, { type: 'bandpass', freq: 1200, gain: 0.2 });
        break;
      default:
        break;
    }
  }

  // Ambient sound that depends on where you are and the time of day
  update(dt, env) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const wind = 0.02 + env.altitude01 * 0.22 + env.night * 0.04 + (env.moving ? 0.01 : 0);
    this.windGain.gain.setTargetAtTime(env.paused ? 0 : wind, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(320 + env.altitude01 * 500 + Math.sin(t * 0.3) * 120, t, 0.8);
    if (env.paused) return;

    if (env.night < 0.5 && env.altitude01 < 0.45) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 2.5 + Math.random() * 5;
        const base = 2200 + Math.random() * 1500;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(base, 0.09, { gain: 0.035, slide: base * 1.35, delay: i * 0.13 });
      }
    }
    if (env.night > 0.5 && env.altitude01 < 0.5) {
      this.cricketT -= dt;
      if (this.cricketT <= 0) {
        this.cricketT = 0.7 + Math.random() * 0.5;
        for (let i = 0; i < 3; i++) this.tone(4300, 0.04, { gain: 0.015, delay: i * 0.06 });
      }
    }
    if (env.nearFire) {
      this.crackleT -= dt;
      if (this.crackleT <= 0) {
        this.crackleT = 0.05 + Math.random() * 0.25;
        this.noise(0.03, { type: 'highpass', freq: 2500, gain: 0.04 + Math.random() * 0.05 });
      }
    }
    if (env.lowHealth) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.85;
        this.tone(60, 0.12, { gain: 0.25, slide: 45 });
        this.tone(55, 0.12, { gain: 0.2, slide: 40, delay: 0.18 });
      }
    }
  }
}
