---
name: bpm-key-finder
description: Finds the BPM, musical key, Camelot code and Open Key code of local audio files or whole folders (WAV natively, MP3/FLAC/M4A via ffmpeg) and lists the keys each track mixes with. Use when the user asks for the BPM or key of a song, wants to tag or sort a DJ crate by Camelot, prepare a harmonic set, or check AI-generated tracks before mixing ("what key is this", "find the BPM", "detectar BPM y tonalidad", "descobrir o tom da música"). Not for streaming URLs, key changes inside a track, or beat grids.
license: MIT
metadata:
  version: 0.1.0
  author: HablaMusic
  homepage: https://github.com/hablamusic/bpm-key-finder
---

# BPM and key finder

Measure tempo (BPM) and musical key of audio files on the user's machine and report them the way DJs use them: key name, Camelot code, Open Key code and compatible keys. Scripts are plain Node 18+ with no packages; WAV is decoded natively, other formats need `ffmpeg` on PATH.

## When to use

- "What's the BPM / key of this song?", "find the key of these tracks", "tag my crate with Camelot codes".
- Preparing a DJ set: sort a folder by BPM or Camelot, export CSV for a prep sheet.
- Checking AI-generated tracks before mixing them (music models follow the requested BPM far more reliably than the requested key).

## When NOT to use

- Streaming links or files the user does not have locally: this works on local files only.
- Detecting key changes inside a track or beat-grid positions: it reports one global BPM and key.

## Steps

1. Find the files. If the user names a folder, use it; add `-r` for sub-folders.
2. Run `node bin/bpm-key-finder.js <files-or-folders> --json` (from this skill's directory). For MP3/FLAC/M4A, check `ffmpeg -version` first; if missing, tell the user how to install it or convert to WAV.
3. Report a short table: file, BPM, key, Camelot, compatible keys. Mention any `low` confidence result and give the runner-up keys from `alternatives`.
4. If they are building a set, sort by Camelot (`--sort camelot`) and explain moves: same code, ±1 number, or A↔B with the same number mix cleanly; +2 or +7 are energy lifts for short transitions.
5. Tempos are folded into 78-175 BPM. For trap, drill or corridos tumbados say the felt tempo is half.

## Output contract

- `--csv`: `file,bpm,key,camelot,open_key,bpm_conf,key_conf,duration`
- `--json`: array of `{file, bpm, key, camelot, openKey, bpmConfidence, keyConfidence, duration, mixesWith, alternatives}`

## Notes

- Accuracy and limits: see README "Accuracy". Relative major/minor and fifth-apart confusions are the common key errors; they still mix.
- Online version for users without a terminal: https://hablamusic.com/dj-tools/bpm-key-finder?utm_source=github&utm_medium=skill&utm_campaign=bpm-key-finder
