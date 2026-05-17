// 808-style drum machine. Eight tracks, each its own synthesized voice,
// laid out as a step grid that locks to the shared Transport.

import * as Tone from "tone";

const DEFAULT_STEPS = 8;
const DRUM_ROWS = [
  { key: "kick",      label: "KICK" },
  { key: "snare",     label: "SNARE" },
  { key: "clap",      label: "CLAP" },
  { key: "closedHat", label: "HAT" },
  { key: "openHat",   label: "OPEN" },
  { key: "tom",       label: "TOM" },
  { key: "rim",       label: "RIM" },
  { key: "cowbell",   label: "BELL" },
];

export class DrumMachine {
  constructor() {
    this.steps = DEFAULT_STEPS;
    // tracks[row][step] = boolean
    this.tracks = DRUM_ROWS.map(() => Array(this.steps).fill(false));
    this.currentStep = 0;
    this.stepListeners = new Set();

    this.gain = new Tone.Gain(Tone.dbToGain(-8));
    this.limiter = new Tone.Limiter(-1);
    this.gain.chain(this.limiter, Tone.Destination);

    this.voices = {
      kick: new Tone.MembraneSynth({
        pitchDecay: 0.04, octaves: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
      }).connect(this.gain),
      snare: new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      }).connect(this.gain),
      clap: new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
      }).connect(this.gain),
      closedHat: new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
        harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      }).connect(this.gain),
      openHat: new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.3, release: 0.05 },
        harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      }).connect(this.gain),
      tom: new Tone.MembraneSynth({
        pitchDecay: 0.05, octaves: 4,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0 },
      }).connect(this.gain),
      rim: new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.02, release: 0.01 },
        harmonicity: 8, modulationIndex: 12, resonance: 8000, octaves: 0.5,
      }).connect(this.gain),
      cowbell: new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.15, release: 0.05 },
        harmonicity: 2.5, modulationIndex: 12, resonance: 800, octaves: 0.5,
      }).connect(this.gain),
    };

    // MetalSynth defaults are very loud; tame them so the kit balances.
    this.voices.closedHat.volume.value = -22;
    this.voices.openHat.volume.value = -22;
    this.voices.rim.volume.value = -20;
    this.voices.cowbell.volume.value = -16;
    this.voices.snare.volume.value = -10;
    this.voices.clap.volume.value = -10;

    this.loop = new Tone.Loop((time) => this._tick(time), "16n");
    this.loop.start(0);
  }

  _tick(time) {
    const step = this.currentStep;
    for (let row = 0; row < DRUM_ROWS.length; row++) {
      if (this.tracks[row][step]) this._trigger(DRUM_ROWS[row].key, time);
    }
    Tone.Draw.schedule(() => {
      for (const fn of this.stepListeners) fn(step);
    }, time);
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  _trigger(key, time) {
    const v = this.voices[key];
    switch (key) {
      case "kick":      v.triggerAttackRelease("C1", "8n", time); break;
      case "tom":       v.triggerAttackRelease("G2", "8n", time); break;
      case "snare":     v.triggerAttackRelease("16n", time); break;
      case "clap":      v.triggerAttackRelease("16n", time); break;
      case "closedHat": v.triggerAttackRelease("C5", "32n", time); break;
      case "openHat":   v.triggerAttackRelease("C5", "16n", time); break;
      case "rim":       v.triggerAttackRelease("C6", "32n", time); break;
      case "cowbell":   v.triggerAttackRelease("A4", "16n", time); break;
    }
  }

  toggleCell(step, row) { this.tracks[row][step] = !this.tracks[row][step]; }
  isOn(step, row) { return !!this.tracks[row][step]; }

  onStep(fn) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  setSteps(n) {
    if (n === this.steps) return;
    for (const track of this.tracks) {
      if (n > track.length) {
        while (track.length < n) track.push(false);
      } else {
        track.length = n;
      }
    }
    this.steps = n;
    if (this.currentStep >= n) this.currentStep = 0;
  }

  setVolumeDb(db) { this.gain.gain.rampTo(Tone.dbToGain(db), 0.05); }
  clear() {
    for (const track of this.tracks) track.fill(false);
  }
}

export const DRUM_DIMS = { DEFAULT_STEPS, DRUM_ROWS };
