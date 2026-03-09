// Empire Reborn — Audio Manager
// Procedural sound synthesis using Web Audio API. No external dependencies.

export interface AudioSettings {
  masterVolume: number;   // 0–1
  sfxVolume: number;      // 0–1
  musicVolume: number;    // 0–1
  muted: boolean;
}

export interface AudioManager {
  readonly settings: AudioSettings;
  readonly ctx: AudioContext;

  /** Resume audio context (must be called from user gesture). */
  resume(): void;

  /** Set master volume (0–1). */
  setMasterVolume(v: number): void;
  /** Set SFX volume (0–1). */
  setSfxVolume(v: number): void;
  /** Set music volume (0–1). */
  setMusicVolume(v: number): void;
  /** Toggle mute. */
  toggleMute(): void;

  // ─── SFX ────────────────────────────────────────────────────────────
  playMove(unitType: number): void;
  playCombat(): void;
  playExplosion(): void;
  playDeath(): void;
  playCapture(): void;
  playSelect(): void;
  playUIClick(): void;
  playTurnStart(): void;
  playTurnEnd(): void;
  playProduction(): void;
  playGameStart(): void;
  playGameOver(won: boolean): void;

  // ─── Ambient ────────────────────────────────────────────────────────
  startAmbient(): void;
  stopAmbient(): void;
}

export function createAudioManager(): AudioManager {
  const ctx = new AudioContext();

  const settings: AudioSettings = {
    masterVolume: 0.5,
    sfxVolume: 0.7,
    musicVolume: 0.3,
    muted: false,
  };

  // ─── Gain nodes ───────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  const sfxGain = ctx.createGain();
  sfxGain.connect(masterGain);

  const musicGain = ctx.createGain();
  musicGain.connect(masterGain);

  function updateGains(): void {
    const m = settings.muted ? 0 : settings.masterVolume;
    masterGain.gain.setTargetAtTime(m, ctx.currentTime, 0.02);
    sfxGain.gain.setTargetAtTime(settings.sfxVolume, ctx.currentTime, 0.02);
    musicGain.gain.setTargetAtTime(settings.musicVolume, ctx.currentTime, 0.02);
  }
  updateGains();

  // ─── Synth helpers ────────────────────────────────────────────────────

  function playTone(
    freq: number, duration: number, type: OscillatorType = "square",
    dest: GainNode = sfxGain, volume = 0.3,
  ): OscillatorNode {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    return osc;
  }

  function playNoise(duration: number, dest: GainNode = sfxGain, volume = 0.2): void {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(dest);
    source.start(ctx.currentTime);
  }

  function playSequence(notes: [number, number][], type: OscillatorType = "square", volume = 0.2): void {
    let t = ctx.currentTime;
    for (const [freq, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  }

  // ─── Ambient ──────────────────────────────────────────────────────────
  let ambientOsc: OscillatorNode | null = null;
  let ambientLfo: OscillatorNode | null = null;

  function startAmbient(): void {
    if (ambientOsc) return;

    // Low drone pad
    ambientOsc = ctx.createOscillator();
    ambientOsc.type = "sine";
    ambientOsc.frequency.setValueAtTime(55, ctx.currentTime); // A1

    const ambGain = ctx.createGain();
    ambGain.gain.setValueAtTime(0.08, ctx.currentTime);

    // LFO for subtle modulation
    ambientLfo = ctx.createOscillator();
    ambientLfo.type = "sine";
    ambientLfo.frequency.setValueAtTime(0.1, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(3, ctx.currentTime);
    ambientLfo.connect(lfoGain);
    lfoGain.connect(ambientOsc.frequency);

    ambientOsc.connect(ambGain);
    ambGain.connect(musicGain);

    ambientOsc.start();
    ambientLfo.start();
  }

  function stopAmbient(): void {
    if (ambientOsc) {
      ambientOsc.stop();
      ambientOsc = null;
    }
    if (ambientLfo) {
      ambientLfo.stop();
      ambientLfo = null;
    }
  }

  // ─── SFX implementations ─────────────────────────────────────────────

  return {
    settings,
    ctx,

    resume() {
      if (ctx.state === "suspended") ctx.resume();
    },

    setMasterVolume(v: number) {
      settings.masterVolume = Math.max(0, Math.min(1, v));
      updateGains();
    },
    setSfxVolume(v: number) {
      settings.sfxVolume = Math.max(0, Math.min(1, v));
      updateGains();
    },
    setMusicVolume(v: number) {
      settings.musicVolume = Math.max(0, Math.min(1, v));
      updateGains();
    },
    toggleMute() {
      settings.muted = !settings.muted;
      updateGains();
    },

    // ─── Movement sounds (varies by unit type) ───────────────────────
    playMove(unitType: number) {
      // 0=Army, 1=Fighter, 2=Patrol..8=Satellite
      if (unitType === 0) {
        // Army: short march step
        playTone(120, 0.08, "square", sfxGain, 0.15);
        setTimeout(() => playTone(100, 0.06, "square", sfxGain, 0.1), 60);
      } else if (unitType === 1) {
        // Fighter: whoosh
        const osc = playTone(800, 0.15, "sawtooth", sfxGain, 0.12);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
      } else if (unitType >= 2 && unitType <= 7) {
        // Ships: water slosh
        const osc = playTone(200, 0.2, "sine", sfxGain, 0.1);
        osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.2);
      } else {
        // Satellite: electronic blip
        playTone(1200, 0.05, "sine", sfxGain, 0.1);
      }
    },

    // ─── Combat ─────────────────────────────────────────────────────
    playCombat() {
      playNoise(0.15, sfxGain, 0.25);
      playTone(150, 0.2, "sawtooth", sfxGain, 0.2);
    },

    // ─── Explosion ──────────────────────────────────────────────────
    playExplosion() {
      playNoise(0.4, sfxGain, 0.35);
      const osc = playTone(80, 0.4, "sawtooth", sfxGain, 0.25);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.4);
    },

    // ─── Death ──────────────────────────────────────────────────────
    playDeath() {
      const osc = playTone(400, 0.3, "square", sfxGain, 0.15);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
      playNoise(0.2, sfxGain, 0.15);
    },

    // ─── City capture ───────────────────────────────────────────────
    playCapture() {
      playSequence([
        [523, 0.1],  // C5
        [659, 0.1],  // E5
        [784, 0.15], // G5
      ], "square", 0.2);
    },

    // ─── Unit selection ─────────────────────────────────────────────
    playSelect() {
      playTone(660, 0.06, "sine", sfxGain, 0.12);
    },

    // ─── UI click ───────────────────────────────────────────────────
    playUIClick() {
      playTone(880, 0.03, "sine", sfxGain, 0.08);
    },

    // ─── Turn start ─────────────────────────────────────────────────
    playTurnStart() {
      playSequence([
        [440, 0.08],  // A4
        [554, 0.08],  // C#5
        [659, 0.12],  // E5
      ], "triangle", 0.18);
    },

    // ─── Turn end ───────────────────────────────────────────────────
    playTurnEnd() {
      playSequence([
        [659, 0.08],  // E5
        [554, 0.08],  // C#5
        [440, 0.12],  // A4
      ], "triangle", 0.15);
    },

    // ─── Production complete ────────────────────────────────────────
    playProduction() {
      playSequence([
        [523, 0.08],  // C5
        [659, 0.08],  // E5
        [784, 0.08],  // G5
        [1047, 0.15], // C6
      ], "square", 0.15);
    },

    // ─── Game start ─────────────────────────────────────────────────
    playGameStart() {
      playSequence([
        [262, 0.12],  // C4
        [330, 0.12],  // E4
        [392, 0.12],  // G4
        [523, 0.2],   // C5
      ], "triangle", 0.2);
    },

    // ─── Game over ──────────────────────────────────────────────────
    playGameOver(won: boolean) {
      if (won) {
        // Victory fanfare
        playSequence([
          [523, 0.15],  // C5
          [659, 0.15],  // E5
          [784, 0.15],  // G5
          [1047, 0.3],  // C6
        ], "triangle", 0.25);
      } else {
        // Defeat dirge
        playSequence([
          [392, 0.2],   // G4
          [330, 0.2],   // E4
          [262, 0.2],   // C4
          [196, 0.4],   // G3
        ], "sawtooth", 0.2);
      }
    },

    startAmbient,
    stopAmbient,
  };
}
