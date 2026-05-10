# Tandem

A two-player browser-based step sequencer — two halves of one screen, one rotated 180° so two people can sit across a laptop and each see their own side right-side-up.

## Run

```
npm install
npm run dev
```

Each player has an 8-step × 8-note grid (C major scale, top row = high), plus filter, decay, wave-shape, and volume controls. Tempo and play/stop are shared in the middle bar.

Click a cell to toggle the note at that step (mono per step — clicking a new row in the same step replaces).

## Stack

- [Vite](https://vitejs.dev/)
- [Tone.js](https://tonejs.github.io/)
