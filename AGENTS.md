# AGENTS.md

This repository is a CLI, a JS library and an agent skill. Agent instructions are in `SKILL.md`.

## Working in this repo

- Zero dependencies: Node 18+ standard library only. No packages, lockfiles or build step.
- `src/analyze.js` must stay browser-compatible (no Node imports). Node-only code goes in `src/decode.js` and `bin/`.
- Run tests: `node test/run.js` (synthetic tracks with known BPM and key, WAV parser, CLI).
- If you change the algorithm, re-run the benchmark files in `benchmark/` and update the README "Accuracy" table with real numbers only.
- Author is HablaMusic <support@hablamusic.com>; do not add personal names. No copyrighted audio in the repo.
