// Bass companion track. Single mono voice, 4 rows of low notes, mono per
// step (like the melodic Sequencer) but tuned and filtered for bass duty.

import * as Tone from "tone";

// Top visual row → bottom: keeps higher pitch at the top, matching the
// melodic players' orientation.
const BASS_SCALE = ["Bb2", "G2", "F2", "C2"];
const DEFAULT_STEPS = 8;
const NOTE_ROWS = BASS_SCALE.length;

// Two voice presets. "Pluck" is the original punchy square-bass. "Sustain"
// is the long, fat, detuned-saw deadmau5 style — held notes with a long
// release and a slower filter envelope, ready to be modulated by the LFO.
const MODES = {
  pluck: {
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.45, sustain: 0.3, release: 0.12 },
    filterEnvelope: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.2, baseFrequency: 80, octaves: 2.2 },
    portamento: 0.04,
    duration: "8n",
  },
  sustain: {
    oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.9, release: 1.6 },
    filterEnvelope: { attack: 0.05, decay: 0.8, sustain: 0.6, release: 1.5, baseFrequency: 60, octaves: 2.6 },
    portamento: 0.12,
    duration: "2n",
  },
};

export class BassMachine {
  constructor() {
    this.steps = DEFAULT_STEPS;
    this.grid = Array(this.steps).fill(null);
    this.currentStep = 0;
    this.stepListeners = new Set();

    this.filter = new Tone.Filter({ type: "lowpass", frequency: 700, Q: 2 });
    // LFO filter for the slow, sweeping modulation that gives sustained
    // bass its movement. Wet=0 by default — the Mod knob brings it in.
    this.modFilter = new Tone.AutoFilter({
      frequency: "2m",
      baseFrequency: 90,
      octaves: 3,
      wet: 0,
      filter: { type: "lowpass", Q: 1.2, rolloff: -24 },
    }).start();
    this.gain = new Tone.Gain(Tone.dbToGain(-8));
    this.limiter = new Tone.Limiter(-1);
    this.voice = new Tone.MonoSynth(MODES.pluck);
    this.voice.chain(this.filter, this.modFilter, this.gain, this.limiter, Tone.Destination);

    this.mode = "pluck";
    this.duration = MODES.pluck.duration;

    this.loop = new Tone.Loop((time) => this._tick(time), "16n");
    this.loop.start(0);
  }

  _tick(time) {
    const step = this.currentStep;
    const noteIdx = this.grid[step];
    if (noteIdx != null) {
      this.voice.triggerAttackRelease(BASS_SCALE[noteIdx], this.duration, time, 0.9);
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
  setMod(amount) { this.modFilter.wet.rampTo(amount, 0.1); }
  setModRate(subdivision) {
    this.modFilter.frequency.value = Tone.Time(subdivision).toFrequency();
  }

  setMode(mode) {
    const cfg = MODES[mode];
    if (!cfg) return;
    this.mode = mode;
    this.duration = cfg.duration;
    const osc = this.voice.oscillator;
    osc.type = cfg.oscillator.type;
    if (cfg.oscillator.count !== undefined) osc.count = cfg.oscillator.count;
    if (cfg.oscillator.spread !== undefined) osc.spread = cfg.oscillator.spread;
    this.voice.portamento = cfg.portamento;
    Object.assign(this.voice.envelope, cfg.envelope);
    Object.assign(this.voice.filterEnvelope, cfg.filterEnvelope);
  }

  clear() { this.grid.fill(null); }
}

export const BASS_DIMS = { DEFAULT_STEPS, NOTE_ROWS, BASS_SCALE };
