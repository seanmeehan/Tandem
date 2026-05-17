// Bass companion track. Single mono voice, 4 rows of low notes, mono per
// step (like the melodic Sequencer) but tuned and filtered for bass duty.

import * as Tone from "tone";

// Top visual row → bottom: keeps higher pitch at the top, matching the
// melodic players' orientation.
const BASS_SCALE = ["Bb2", "G2", "F2", "C2"];
const DEFAULT_STEPS = 8;
const NOTE_ROWS = BASS_SCALE.length;

export class BassMachine {
  constructor() {
    this.steps = DEFAULT_STEPS;
    this.grid = Array(this.steps).fill(null);
    this.currentStep = 0;
    this.stepListeners = new Set();
    this.muted = false;

    this.filter = new Tone.Filter({ type: "lowpass", frequency: 700, Q: 2 });
    this.gain = new Tone.Gain(Tone.dbToGain(-8));
    this.limiter = new Tone.Limiter(-1);
    this.voice = new Tone.MonoSynth({
      portamento: 0.04,
      oscillator: { type: "square" },
      envelope: { attack: 0.005, decay: 0.45, sustain: 0.3, release: 0.12 },
      filterEnvelope: {
        attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.2,
        baseFrequency: 80, octaves: 2.2,
      },
    });
    this.voice.chain(this.filter, this.gain, this.limiter, Tone.Destination);

    this.loop = new Tone.Loop((time) => this._tick(time), "16n");
    this.loop.start(0);
  }

  _tick(time) {
    const step = this.currentStep;
    const noteIdx = this.grid[step];
    if (!this.muted && noteIdx != null) {
      this.voice.triggerAttackRelease(BASS_SCALE[noteIdx], "8n", time, 0.9);
    }
    Tone.Draw.schedule(() => {
      for (const fn of this.stepListeners) fn(step);
    }, time);
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  toggleCell(step, noteIdx) {
    this.grid[step] = this.grid[step] === noteIdx ? null : noteIdx;
  }

  isOn(step, noteIdx) { return this.grid[step] === noteIdx; }

  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  setSteps(n) {
    if (n === this.steps) return;
    if (n > this.grid.length) {
      while (this.grid.length < n) this.grid.push(null);
    } else {
      this.grid.length = n;
    }
    this.steps = n;
    if (this.currentStep >= n) this.currentStep = 0;
  }

  setVolumeDb(db) { this.gain.gain.rampTo(Tone.dbToGain(db), 0.05); }
  setFilter(hz) { this.filter.frequency.rampTo(hz, 0.05); }
  setMuted(on) { this.muted = !!on; }
  clear() { this.grid.fill(null); }
}

export const BASS_DIMS = { DEFAULT_STEPS, NOTE_ROWS, BASS_SCALE };
