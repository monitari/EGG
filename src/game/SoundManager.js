export class SoundManager {
  constructor() {
    this.context = null;
    this.muted = false;
    this.sizzle = null;
  }

  ensureContext() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') this.context.resume();
    return this.context;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.sizzle?.gain) this.sizzle.gain.gain.setTargetAtTime(muted ? 0 : 0.025, this.context.currentTime, 0.05);
  }

  tone(frequency = 440, duration = 0.12, type = 'sine', volume = 0.045, endFrequency = frequency) {
    if (this.muted) return;
    const context = this.ensureContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  pickup() {
    this.tone(310, 0.11, 'sine', 0.035, 430);
  }

  tap(count = 1) {
    this.tone(count === 1 ? 540 : 620, 0.07, 'triangle', 0.045, count === 1 ? 470 : 510);
  }

  crack() {
    this.noise(0.18, 0.045);
    this.tone(280, 0.24, 'triangle', 0.04, 130);
  }

  warning() {
    this.tone(180, 0.09, 'square', 0.018, 140);
  }

  success() {
    [523, 659, 784].forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, 0.22, 'sine', 0.04, frequency * 1.04), index * 90);
    });
  }

  failure() {
    this.noise(0.18, 0.035);
    this.tone(230, 0.4, 'sawtooth', 0.025, 90);
  }

  noise(duration = 0.2, volume = 0.03) {
    if (this.muted) return;
    const context = this.ensureContext();
    if (!context) return;
    const frameCount = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.55;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }

  startSizzle() {
    if (this.sizzle || this.muted) return;
    const context = this.ensureContext();
    if (!context) return;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = last * (Math.random() > 0.988 ? 2.2 : 0.55);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'highpass';
    filter.frequency.value = 900;
    gain.gain.value = 0.025;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    this.sizzle = { source, gain };
  }

  stopSizzle() {
    if (!this.sizzle) return;
    try { this.sizzle.source.stop(); } catch { /* already stopped */ }
    this.sizzle = null;
  }
}
