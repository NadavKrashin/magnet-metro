/**
 * All sound is synthesised at runtime. No audio files, so the whole game stays a few tens of
 * kilobytes and there is nothing to wait on before the first run starts.
 *
 * The music is not a loop that plays underneath the game — it is driven by how well the run is
 * going. Tempo, layers and filter all rise with the player's combo, so the soundtrack builds
 * as they build and drops out when they get hit. That coupling is most of why an arcade game
 * feels exciting, and it cannot be bolted on afterwards.
 */

const PENTATONIC = [0, 3, 5, 7, 10]; // minor pentatonic, in semitones
const BASS_RIFF = [0, 0, -2, 0, 3, 0, -2, -5]; // eight eighth-notes, semitones from root
const ROOT_HZ = 110; // A2

function semitone(base: number, steps: number): number {
  return base * Math.pow(2, steps / 12);
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private schedulerId = 0;
  private nextNoteTime = 0;
  private step = 0;
  private playing = false;

  /** 0..1. Drives tempo, layering and brightness. */
  private intensity = 0;
  muted = false;

  /**
   * Browsers refuse to start audio without a gesture, so this is called from the first touch.
   * Safe to call repeatedly.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.75;
    this.sfxBus.connect(this.master);

    // One second of white noise, reused for every percussive and impact sound.
    const frames = ctx.sampleRate;
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.02);
    }
  }

  setIntensity(t: number): void {
    this.intensity = Math.max(0, Math.min(1, t));
  }

  // -------------------------------------------------------------------------
  // One-shot effects
  // -------------------------------------------------------------------------

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, gain: number, filterHz: number, sweepTo?: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.noiseBuffer) return;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterHz, t);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    filter.Q.value = 1.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  /** Rises through the pentatonic scale as the combo climbs, then resets. That ladder is the
   *  single most addictive sound in this genre. */
  collect(comboIndex: number): void {
    const degree = comboIndex % PENTATONIC.length;
    const octave = Math.min(2, Math.floor(comboIndex / PENTATONIC.length));
    const freq = semitone(ROOT_HZ * 4, PENTATONIC[degree]! + octave * 12);
    this.tone(freq, 0.11, "triangle", 0.16);
  }

  /** Eating a matching wall. Deliberately the biggest sound in the game. */
  absorb(): void {
    this.tone(180, 0.42, "sine", 0.5, 42);
    this.tone(ROOT_HZ * 2, 0.3, "square", 0.1, ROOT_HZ * 4);
    this.noise(0.34, 0.4, 1800, 180);
  }

  hit(): void {
    this.tone(150, 0.4, "sawtooth", 0.3, 48);
    this.noise(0.35, 0.45, 900, 120);
  }

  flip(toRed: boolean): void {
    // Two clearly different pitches so the ear also tells you which colour you became.
    this.noise(0.14, 0.2, toRed ? 900 : 1700, toRed ? 1700 : 900);
    this.tone(toRed ? 300 : 480, 0.1, "square", 0.07);
  }

  finish(won: boolean): void {
    if (won) {
      [0, 4, 7, 12].forEach((s, i) => {
        window.setTimeout(() => this.tone(semitone(ROOT_HZ * 4, s), 0.34, "triangle", 0.2), i * 85);
      });
    } else {
      [0, -3, -7].forEach((s, i) => {
        window.setTimeout(() => this.tone(semitone(ROOT_HZ * 2, s), 0.4, "sawtooth", 0.18), i * 130);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Adaptive music
  // -------------------------------------------------------------------------

  startMusic(): void {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    // A lookahead scheduler: timers are far too jittery to place notes directly, so the timer
    // only decides what to queue and the audio clock decides when it actually sounds.
    this.schedulerId = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.playing = false;
    window.clearInterval(this.schedulerId);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;

    const bpm = 104 + this.intensity * 46;
    const eighth = 30 / bpm;

    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += eighth;
      this.step = (this.step + 1) % 8;
    }
  }

  private playStep(step: number, time: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const i = this.intensity;

    // Kick on the downbeats. Always present, so there is always a pulse to move to.
    if (step === 0 || step === 4) this.kick(time, 0.9);

    // Bass riff enters immediately but opens up its filter as the run heats up.
    this.bass(time, semitone(ROOT_HZ, BASS_RIFF[step]!), 0.5 + i * 0.5);

    // Hats join once the player has something going.
    if (i > 0.25 && step % 2 === 1) this.hat(time, 0.25 + i * 0.4);

    // The lead only arrives on a strong combo. It is the audible reward for playing well.
    if (i > 0.62) {
      const degree = PENTATONIC[(step * 2) % PENTATONIC.length]!;
      this.lead(time, semitone(ROOT_HZ * 4, degree), 0.2 + (i - 0.62) * 0.5);
    }
  }

  private kick(time: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.13);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

    osc.connect(env);
    env.connect(this.musicBus!);
    osc.start(time);
    osc.stop(time + 0.22);
  }

  private bass(time: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320 + this.intensity * 1500, time);
    filter.Q.value = 6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(gain * 0.32, time + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.musicBus!);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private hat(time: number, gain: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain * 0.12, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.musicBus!);
    src.start(time);
    src.stop(time + 0.07);
  }

  private lead(time: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(gain * 0.09, time + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

    osc.connect(env);
    env.connect(this.musicBus!);
    osc.start(time);
    osc.stop(time + 0.14);
  }
}
