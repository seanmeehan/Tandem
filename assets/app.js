import * as Tone from "tone";
import { Sequencer, SEQUENCER_DIMS } from "./modules/sequencer.js";

const { DEFAULT_STEPS, NOTE_ROWS } = SEQUENCER_DIMS;

let started = false;
const sequencers = {}; // 'a' | 'b' → Sequencer
const playheadUnsubs = {};

const playBtn = document.getElementById("play");
const tempoInput = document.getElementById("tempo");
const tempoDisplay = document.getElementById("tempo-display");
const swingInput = document.getElementById("swing");
const swingDisplay = document.getElementById("swing-display");
const recordBtn = document.getElementById("record");
const statusEl = document.getElementById("status");

let recorder = null;

Tone.Transport.swingSubdivision = "16n";

// Build a grid: 8 columns (steps) × 8 rows (notes).
// Each cell stores its step/note via dataset; toggled state is reflected
// from the corresponding Sequencer.
function buildGrid(gridEl, playerKey, steps = DEFAULT_STEPS) {
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
  // We iterate row-major so CSS Grid auto-flow places them correctly
  // (rows top→bottom, columns left→right).
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
  root.querySelectorAll(".knob, .wave").forEach((el) => {
    el.addEventListener("input", () => {
      const seq = sequencers[playerKey];
      if (!seq) return;
      const v = el.tagName === "SELECT" ? el.value : Number(el.value);
      applyParam(seq, el.dataset.param, v);
    });
  });
  root.querySelectorAll(".toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("on");
      btn.classList.toggle("on", on);
      const seq = sequencers[playerKey];
      if (!seq) return;
      applyParam(seq, btn.dataset.param, on);
    });
  });
}

function applyInitialControls(playerKey) {
  const seq = sequencers[playerKey];
  if (!seq) return;
  const root = document.getElementById(`player-${playerKey}`);
  root.querySelectorAll(".knob, .wave").forEach((el) => {
    const v = el.tagName === "SELECT" ? el.value : Number(el.value);
    applyParam(seq, el.dataset.param, v);
  });
  root.querySelectorAll(".toggle").forEach((btn) => {
    applyParam(seq, btn.dataset.param, btn.classList.contains("on"));
  });
}

const stepsSelect = document.getElementById("steps-count");

// Build grids up-front so users can program patterns before pressing play
// (their clicks just won't make sound yet).
buildGrid(document.querySelector('.grid[data-player="a"]'), "a", Number(stepsSelect.value));
buildGrid(document.querySelector('.grid[data-player="b"]'), "b", Number(stepsSelect.value));
wireControls("a");
wireControls("b");

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
    // Tap each sequencer's output gain in parallel with Destination
    // Tap each sequencer's limiter so we record the same signal we hear
    sequencers.a.limiter.connect(recorder);
    sequencers.b.limiter.connect(recorder);
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
