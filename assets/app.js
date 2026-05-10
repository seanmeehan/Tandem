import * as Tone from "tone";
import { Sequencer, SEQUENCER_DIMS } from "./modules/sequencer.js";

const { STEPS, NOTE_ROWS } = SEQUENCER_DIMS;

let started = false;
const sequencers = {}; // 'a' | 'b' → Sequencer

const playBtn = document.getElementById("play");
const tempoInput = document.getElementById("tempo");
const tempoDisplay = document.getElementById("tempo-display");
const swingInput = document.getElementById("swing");
const swingDisplay = document.getElementById("swing-display");
const statusEl = document.getElementById("status");

Tone.Transport.swingSubdivision = "16n";

// Build a grid: 8 columns (steps) × 8 rows (notes).
// Each cell stores its step/note via dataset; toggled state is reflected
// from the corresponding Sequencer.
function buildGrid(gridEl, playerKey) {
  gridEl.innerHTML = "";
  // We iterate row-major so CSS Grid auto-flow places them correctly
  // (rows top→bottom, columns left→right).
  for (let row = 0; row < NOTE_ROWS; row++) {
    for (let step = 0; step < STEPS; step++) {
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
  const cells = Array.from(
    document.querySelectorAll(`.cell[data-player="${playerKey}"]`)
  );
  seq.onStep((currentStep) => {
    cells.forEach((cell) => {
      const step = Number(cell.dataset.step);
      cell.classList.toggle("playhead", step === currentStep);
    });
  });
}

function wireControls(playerKey) {
  const root = document.getElementById(`player-${playerKey}`);
  root.querySelectorAll(".knob, .wave").forEach((el) => {
    el.addEventListener("input", () => {
      const seq = sequencers[playerKey];
      if (!seq) return;
      const param = el.dataset.param;
      const v = el.tagName === "SELECT" ? el.value : Number(el.value);
      if (param === "filter") seq.setFilter(v);
      else if (param === "decay") seq.setDecay(v);
      else if (param === "wave") seq.setWave(v);
      else if (param === "vol") seq.setVolumeDb(v);
    });
  });
}

function applyInitialControls(playerKey) {
  const seq = sequencers[playerKey];
  if (!seq) return;
  const root = document.getElementById(`player-${playerKey}`);
  root.querySelectorAll(".knob, .wave").forEach((el) => {
    const param = el.dataset.param;
    const v = el.tagName === "SELECT" ? el.value : Number(el.value);
    if (param === "filter") seq.setFilter(v);
    else if (param === "decay") seq.setDecay(v);
    else if (param === "wave") seq.setWave(v);
    else if (param === "vol") seq.setVolumeDb(v);
  });
}

// Build grids up-front so users can program patterns before pressing play
// (their clicks just won't make sound yet).
buildGrid(document.querySelector('.grid[data-player="a"]'), "a");
buildGrid(document.querySelector('.grid[data-player="b"]'), "b");
wireControls("a");
wireControls("b");

playBtn.addEventListener("click", async () => {
  if (!started) {
    await Tone.start();
    sequencers.a = new Sequencer("A", "a");
    sequencers.b = new Sequencer("B", "b");
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
