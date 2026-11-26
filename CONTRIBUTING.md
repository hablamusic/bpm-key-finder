# Contributing

Thanks for helping. Bug reports with a short description of the track (genre, length, what your DJ software says) are the most useful thing you can send; please do not attach copyrighted audio.

- Keep it zero-dependency (Node 18+ stdlib) and keep `src/analyze.js` free of Node-only imports so it runs in browsers.
- Add a test in `test/run.js` for any fix. Synthetic tracks are in `test/synth.js`.
- Accuracy claims in the README must come from a run you can share (see `benchmark/`).
- Translations of the README are welcome (keep the same sections).

Run `node test/run.js` before opening a pull request.
