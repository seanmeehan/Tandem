// One sequencer = one player. Owns an 8-step × 8-note grid, a MonoSynth
// voice + filter, and a Tone.Loop synced to the shared Transport.

import * as Tone from "tone";

// Mixolydian gives both major brightness and a flat 7 for tension — a
// pleasant scale to play random sequences in. Bottom row is the lowest note,
// top row the highest (so visually the high notes sit "up").
const SCALE = ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];

const STEPS = 8;
const NOTE_ROWS = SCALE.length;

export class Sequencer {
  constructor(name, color) {
    this.name = name;
    this.color = color;
    // grid[step] = note index (0..NOTE_ROWS-1) or null
    this.grid = Array(STEPS).fill(null);
    this.currentStep = 0;
    this.stepListeners = new Set();

    this.filter = new Tone.Filter({ type: "lowpass", frequency: 2000, Q: 1.5 });
    this.crusher = new Tone.BitCrusher({ bits: 4, wet: 0 });
    this.gain = new Tone.Gain(Tone.dbToGain(-10));
    this.voice = new Tone.MonoSynth({
      portamento: 0,
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.08 },
      filterEnvelope: {
        attack: 0.005, decay: 0.2, sustain: 0.2, release: 0.1,
        baseFrequency: 200, octaves: 3,
      },
    });
    this.voice.chain(this.filter, this.crusher, this.gain, Tone.Destination);

    this.loop = new Tone.Loop((time) => this._tick(time), "16n");
    this.loop.start(0);
  }

  _tick(time) {
    const step = this.currentStep;
    const noteIdx = this.grid[step];
    if (noteIdx != null) {
      this.voice.triggerAttackRelease(SCALE[noteIdx], "16n", time, 0.9);
    }
    Tone.Draw.schedule(() => {
      for (const fn of this.stepListeners) fn(step);
    }, time);
    this.currentStep = (this.currentStep + 1) % STEPS;
  }

  toggleCell(step, noteIdx) {
    // Mono per step: setting a new note replaces; same note clears.
    this.grid[step] = this.grid[step] === noteIdx ? null : noteIdx;
  }

  isOn(step, noteIdx) {
    return this.grid[step] === noteIdx;
  }

  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  setFilter(hz) { this.filter.frequency.rampTo(hz, 0.05); }
  setResonance(q) { this.filter.Q.rampTo(q, 0.05); }
  setDecay(seconds) { this.voice.envelope.decay = seconds; }
  setWave(type) { this.voice.oscillator.type = type; }
  setVolumeDb(db) { this.gain.gain.rampTo(Tone.dbToGain(db), 0.05); }
  setGlide(on) { this.voice.portamento = on ? 0.08 : 0; }
  setCrush(on) { this.crusher.wet.rampTo(on ? 0.8 : 0, 0.04); }
}

export const SEQUENCER_DIMS = { STEPS, NOTE_ROWS };
