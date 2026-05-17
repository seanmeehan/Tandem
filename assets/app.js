import * as Tone from "tone";
import { Sequencer, SEQUENCER_DIMS } from "./modules/sequencer.js";
import { DrumMachine, DRUM_DIMS } from "./modules/drums.js";
import { BassMachine, BASS_DIMS } from "./modules/bass.js";

const { DEFAULT_STEPS, NOTE_ROWS } = SEQUENCER_DIMS;
const { DRUM_ROWS } = DRUM_DIMS;
const { NOTE_ROWS: BASS_ROWS } = BASS_DIMS;

const MODE = new URLSearchParams(location.search).get("mode") === "toddler" ? "toddler" : "jam";
document.body.classList.add(`mode-${MODE}`);

let started = false;
const sequencers = {}; // 'a' | 'b' → Sequencer
const playheadUnsubs = {};
let drums = null;
let drumPlayheadUnsub = null;
let bass = null;
let bassPlayheadUnsub = null;

const playBtn = document.getElementById("play");
const tempoInput = document.getElementById("tempo");
const tempoDisplay = document.getElementById("tempo-display");
const swingInput = document.getElementById("swing");
const swingDisplay = document.getElementById("swing-display");
const recordBtn = document.getElementById("record");
const statusEl = document.getElementById("status");

let recorder = null;

Tone.Transport.swingSubdivision = "16n";

// Build a grid: N columns (steps) × NOTE_ROWS rows (notes).
// Each cell stores its step/note via dataset; toggled state is reflected
// from the corresponding Sequencer.
function buildGrid(gridEl, playerKey, steps = DEFAULT_STEPS) {
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
  for (let row = 0; row < NOTE_ROWS; row++) {
    for (let step = 0; step < steps; step++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.step = String(step);
      cell.dataset.row = String(row);
      cell.dataset.player = playerKey;
      cell.addEventListener("click", () => {
        const seq = sequencers[playerKey];
        if (!seq) return;
        seq.toggleCell(step, row);
        renderCells(playerKey);
      });
      gridEl.appendChild(cell);
    }
  }
}

function renderCells(playerKey) {
  const seq = sequencers[playerKey];
  if (!seq) return;
  const cells = document.querySelectorAll(`.cell[data-player="${playerKey}"]`);
  cells.forEach((cell) => {
    const step = Number(cell.dataset.step);
    const row = Number(cell.dataset.row);
    cell.classList.toggle("on", seq.isOn(step, row));
  });
}

function attachPlayhead(playerKey) {
  const seq = sequencers[playerKey];
  if (!seq) return;
  if (playheadUnsubs[playerKey]) playheadUnsubs[playerKey]();
  const cells = Array.from(
    document.querySelectorAll(`.cell[data-player="${playerKey}"]`)
  );
  playheadUnsubs[playerKey] = seq.onStep((currentStep) => {
    cells.forEach((cell) => {
      const step = Number(cell.dataset.step);
      cell.classList.toggle("playhead", step === currentStep);
    });
  });
}

function applyParam(seq, param, value) {
  if (param === "filter") seq.setFilter(Number(value));
  else if (param === "res") seq.setResonance(Number(value));
  else if (param === "env") seq.setEnvFilter(Number(value));
  else if (param === "decay") seq.setDecay(Number(value));
  else if (param === "wave") seq.setWave(value);
  else if (param === "vol") seq.setVolumeDb(Number(value));
  else if (param === "glide") seq.setGlide(!!value);
  else if (param === "crush") seq.setCrush(!!value);
}

function wireControls(playerKey) {
  const root = document.getElementById(`player-${playerKey}`);
  const melodyControls = root.querySelector(".melody-controls");
  melodyControls.querySelectorAll(".knob, .wave").forEach((el) => {
    el.addEventListener("input", () => {
      const seq = sequencers[playerKey];
      if (!seq) return;
      const v = el.tagName === "SELECT" ? el.value : Number(el.value);
      applyParam(seq, el.dataset.param, v);
    });
  });
  melodyControls.querySelectorAll(".toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("on");
      btn.classList.toggle("on", on);
      const seq = sequencers[playerKey];
      if (!seq) return;
      applyParam(seq, btn.dataset.param, on);
    });
  });
  const randomBtn = melodyControls.querySelector(".randomize");
  if (randomBtn) {
    randomBtn.addEventListener("click", () => randomizeSound(playerKey));
  }
}

// Musically-safe random ranges — wide enough to feel different each press,
// narrow enough to stay pleasant. Vol is intentionally excluded so volume
// never jumps unexpectedly.
const WAVES = ["sawtooth", "square", "triangle", "sine"];
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomizeSound(playerKey) {
  const root = document.getElementById(`player-${playerKey}`);
  const melodyControls = root.querySelector(".melody-controls");
  const newValues = {
    filter: Math.round(rand(600, 6000)),
    res: +rand(0.8, 6).toFixed(2),
    env: +rand(0, 0.6).toFixed(2),
    decay: +rand(0.08, 0.8).toFixed(2),
    wave: pick(WAVES),
    glide: Math.random() < 0.3,
    crush: Math.random() < 0.2,
  };

  melodyControls.querySelectorAll(".knob, .wave").forEach((el) => {
    if (!(el.dataset.param in newValues)) return;
    el.value = newValues[el.dataset.param];
  });
  melodyControls.querySelectorAll(".toggle").forEach((btn) => {
    const p = btn.dataset.param;
    if (!(p in newValues)) return;
    btn.classList.toggle("on", newValues[p]);
  });

  const seq = sequencers[playerKey];
  if (!seq) return;
  for (const [param, value] of Object.entries(newValues)) {
    applyParam(seq, param, value);
  }

  const btn = melodyControls.querySelector(".randomize");
  if (btn) {
    btn.classList.remove("rolling");
    void btn.offsetWidth;
    btn.classList.add("rolling");
  }
}

function applyInitialControls(playerKey) {
  const seq = sequencers[playerKey];
  if (!seq) return;
  const root = document.getElementById(`player-${playerKey}`);
  const melodyControls = root.querySelector(".melody-controls");
  melodyControls.querySelectorAll(".knob, .wave").forEach((el) => {
    const v = el.tagName === "SELECT" ? el.value : Number(el.value);
    applyParam(seq, el.dataset.param, v);
  });
  melodyControls.querySelectorAll(".toggle").forEach((btn) => {
    applyParam(seq, btn.dataset.param, btn.classList.contains("on"));
  });
}

const stepsSelect = document.getElementById("steps-count");

// Build all four grids up-front so users can program patterns before pressing
// play (their clicks just won't make sound yet).
buildGrid(document.querySelector('.grid[data-player="a"]'), "a", Number(stepsSelect.value));
buildGrid(document.querySelector('.grid[data-player="b"]'), "b", Number(stepsSelect.value));
wireControls("a");
wireControls("b");

// --- View toggle: each player slot swaps between melody and its companion --
// All four sequencers always play; the toggle just changes what's on screen.

const players = {
  a: {
    melodyGrid: document.querySelector('.grid[data-player="a"]'),
    companionGrid: document.getElementById("bass-grid"),
    melodyControls: document.querySelector('#player-a .melody-controls'),
    companionControls: document.querySelector('#player-a .companion-controls'),
    toggleBtn: document.getElementById("bass-toggle"),
  },
  b: {
    melodyGrid: document.querySelector('.grid[data-player="b"]'),
    companionGrid: document.getElementById("drum-grid"),
    melodyControls: document.querySelector('#player-b .melody-controls'),
    companionControls: document.querySelector('#player-b .companion-controls'),
    toggleBtn: document.getElementById("drum-toggle"),
  },
};
const playerView = { a: "melody", b: "melody" };

function setPlayerView(playerKey, mode) {
  const p = players[playerKey];
  const companion = mode === "companion";
  p.melodyGrid.hidden = companion;
  p.companionGrid.hidden = !companion;
  p.melodyControls.hidden = companion;
  p.companionControls.hidden = !companion;
  p.toggleBtn.classList.toggle("on", companion);
  playerView[playerKey] = mode;
}

players.a.toggleBtn.addEventListener("click", () => {
  setPlayerView("a", playerView.a === "melody" ? "companion" : "melody");
});
players.b.toggleBtn.addEventListener("click", () => {
  setPlayerView("b", playerView.b === "melody" ? "companion" : "melody");
});

// --- Drums -----------------------------------------------------------------

const drumGridEl = document.getElementById("drum-grid");
const drumVolInput = document.querySelector(".drum-knob");
const drumClearBtn = document.getElementById("drum-clear");

function buildDrumGrid(steps) {
  drumGridEl.innerHTML = "";
  drumGridEl.style.gridTemplateColumns = `72px repeat(${steps}, 1fr)`;
  for (let row = 0; row < DRUM_ROWS.length; row++) {
    const label = document.createElement("div");
    label.className = "drum-label";
    label.textContent = DRUM_ROWS[row].label;
    drumGridEl.appendChild(label);
    for (let step = 0; step < steps; step++) {
      const cell = document.createElement("div");
      cell.className = "cell drum-cell";
      cell.dataset.step = String(step);
      cell.dataset.row = String(row);
      cell.addEventListener("click", () => {
        if (!drums) return;
        drums.toggleCell(step, row);
        renderDrumCells();
      });
      drumGridEl.appendChild(cell);
    }
  }
}

function renderDrumCells() {
  if (!drums) return;
  drumGridEl.querySelectorAll(".drum-cell").forEach((cell) => {
    const step = Number(cell.dataset.step);
    const row = Number(cell.dataset.row);
    cell.classList.toggle("on", drums.isOn(step, row));
  });
}

function attachDrumPlayhead() {
  if (!drums) return;
  if (drumPlayheadUnsub) drumPlayheadUnsub();
  const cells = Array.from(drumGridEl.querySelectorAll(".drum-cell"));
  drumPlayheadUnsub = drums.onStep((currentStep) => {
    cells.forEach((cell) => {
      const step = Number(cell.dataset.step);
      cell.classList.toggle("playhead", step === currentStep);
    });
  });
}

drumVolInput.addEventListener("input", () => {
  if (drums) drums.setVolumeDb(Number(drumVolInput.value));
});

drumClearBtn.addEventListener("click", () => {
  if (!drums) return;
  drums.clear();
  renderDrumCells();
});

// --- Bass ------------------------------------------------------------------

const bassGridEl = document.getElementById("bass-grid");
const bassClearBtn = document.getElementById("bass-clear");
const bassKnobs = document.querySelectorAll(".bass-knob");

function buildBassGrid(steps) {
  bassGridEl.innerHTML = "";
  bassGridEl.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
  bassGridEl.style.gridTemplateRows = `repeat(${BASS_ROWS}, 1fr)`;
  for (let row = 0; row < BASS_ROWS; row++) {
    for (let step = 0; step < steps; step++) {
      const cell = document.createElement("div");
      cell.className = "cell bass-cell";
      cell.dataset.step = String(step);
      cell.dataset.row = String(row);
      cell.addEventListener("click", () => {
        if (!bass) return;
        bass.toggleCell(step, row);
        renderBassCells();
      });
      bassGridEl.appendChild(cell);
    }
  }
}

function renderBassCells() {
  if (!bass) return;
  bassGridEl.querySelectorAll(".bass-cell").forEach((cell) => {
    const step = Number(cell.dataset.step);
    const row = Number(cell.dataset.row);
    cell.classList.toggle("on", bass.isOn(step, row));
  });
}

function attachBassPlayhead() {
  if (!bass) return;
  if (bassPlayheadUnsub) bassPlayheadUnsub();
  const cells = Array.from(bassGridEl.querySelectorAll(".bass-cell"));
  bassPlayheadUnsub = bass.onStep((currentStep) => {
    cells.forEach((cell) => {
      const step = Number(cell.dataset.step);
      cell.classList.toggle("playhead", step === currentStep);
    });
  });
}

function applyBassControls() {
  if (!bass) return;
  bassKnobs.forEach((el) => {
    const v = Number(el.value);
    if (el.dataset.param === "filter") bass.setFilter(v);
    else if (el.dataset.param === "vol") bass.setVolumeDb(v);
  });
}

bassKnobs.forEach((el) => {
  el.addEventListener("input", () => {
    if (!bass) return;
    const v = Number(el.value);
    if (el.dataset.param === "filter") bass.setFilter(v);
    else if (el.dataset.param === "vol") bass.setVolumeDb(v);
  });
});

bassClearBtn.addEventListener("click", () => {
  if (!bass) return;
  bass.clear();
  renderBassCells();
});

// Build companion grids up-front too — they're always available, the toggle
// just controls which is visible.
buildBassGrid(Number(stepsSelect.value));
buildDrumGrid(Number(stepsSelect.value));

stepsSelect.addEventListener("change", () => {
  const n = Number(stepsSelect.value);
  for (const key of ["a", "b"]) {
    const seq = sequencers[key];
    if (seq) seq.setSteps(n);
    const gridEl = document.querySelector(`.grid[data-player="${key}"]`);
    buildGrid(gridEl, key, n);
    if (seq) {
      renderCells(key);
      attachPlayhead(key);
    }
  }
  if (drums) drums.setSteps(n);
  buildDrumGrid(n);
  if (drums) {
    renderDrumCells();
    attachDrumPlayhead();
  }
  if (bass) bass.setSteps(n);
  buildBassGrid(n);
  if (bass) {
    renderBassCells();
    attachBassPlayhead();
  }
});

playBtn.addEventListener("click", async () => {
  if (!started) {
    await Tone.start();
    sequencers.a = new Sequencer("A", "a");
    sequencers.b = new Sequencer("B", "b");
    const initialSteps = Number(stepsSelect.value);
    sequencers.a.setSteps(initialSteps);
    sequencers.b.setSteps(initialSteps);
    applyInitialControls("a");
    applyInitialControls("b");
    attachPlayhead("a");
    attachPlayhead("b");
    renderCells("a");
    renderCells("b");

    drums = new DrumMachine();
    drums.setSteps(initialSteps);
    drums.setVolumeDb(Number(drumVolInput.value));
    attachDrumPlayhead();
    renderDrumCells();

    bass = new BassMachine();
    bass.setSteps(initialSteps);
    applyBassControls();
    attachBassPlayhead();
    renderBassCells();

    Tone.Transport.bpm.value = Number(tempoInput.value);
    started = true;
  }

  if (Tone.Transport.state === "started") {
    Tone.Transport.stop();
    playBtn.textContent = "▶ Play";
    playBtn.classList.remove("playing");
    statusEl.textContent = "stopped";
  } else {
    Tone.Transport.start();
    playBtn.textContent = "■ Stop";
    playBtn.classList.add("playing");
    statusEl.textContent = "running";
  }
});

tempoInput.addEventListener("input", () => {
  const bpm = Number(tempoInput.value);
  Tone.Transport.bpm.value = bpm;
  tempoDisplay.textContent = bpm;
});

swingInput.addEventListener("input", () => {
  const s = Number(swingInput.value);
  Tone.Transport.swing = s;
  swingDisplay.textContent = `${Math.round(s * 100)}%`;
});

recordBtn.addEventListener("click", async () => {
  if (!started) {
    alert("Press Play first to start audio.");
    return;
  }
  if (!recorder) {
    recorder = new Tone.Recorder();
    // Tap each voice's limiter so we record the same signal we hear.
    sequencers.a.limiter.connect(recorder);
    sequencers.b.limiter.connect(recorder);
    if (drums) drums.limiter.connect(recorder);
    if (bass) bass.limiter.connect(recorder);
  }
  if (recorder.state === "started") {
    const blob = await recorder.stop();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tandem-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordBtn.textContent = "● Record";
    recordBtn.classList.remove("recording");
  } else {
    recorder.start();
    recordBtn.textContent = "■ Save";
    recordBtn.classList.add("recording");
  }
});
