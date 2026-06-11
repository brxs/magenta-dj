// The M14 spike measurement: the SHIPPING estimator over real
// generated audio. Plain JS on purpose: node APIs stay outside the
// DOM-typed app project (the kernel-test precedent). Skipped until
// the corpus exists — generate it with
//   cd backend && uv run python scripts/spike_beat_corpus.py
// (needs the model weights). Findings land in
// docs/spike-beat-detection.md.
//
// Ship criterion: every rhythmic style ends with a displayed BPM that
// octave-matches the librosa reference; every beatless style ends
// with an honest blank.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createBeatGate, createBeatTracker } from './beat'
import { readWav } from '../test/readWav.js'

// vitest runs with cwd = frontend/ (import.meta.url is not a file URL
// under the jsdom transform).
const CORPUS = path.resolve(process.cwd(), '../backend/spike_corpus')
const MANIFEST = path.join(CORPUS, 'manifest.json')

const entries = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
  : []

// Beat trackers octave-err honestly; accept ×0.5/×1/×2 within 8%.
function octaveMatches(estimate, reference) {
  return [0.5, 1, 2].some(
    (factor) => Math.abs(estimate * factor - reference) / reference <= 0.08,
  )
}

describe('beat estimator on the spike corpus', () => {
  if (entries.length === 0) {
    it.skip('corpus not generated (backend/scripts/spike_beat_corpus.py)', () => {})
    return
  }

  it.each(entries.map((entry) => [entry.file, entry]))('%s', (_file, entry) => {
    const { sampleRate, samples } = readWav(path.join(CORPUS, entry.file))
    const tracker = createBeatTracker(sampleRate)
    const gate = createBeatGate()

    // Stream exactly like the live feed: 40 ms chunks, an estimate
    // through the gate once per second.
    const chunk = Math.round(0.04 * sampleRate) * 2
    const perSecond = Math.round(sampleRate * 2)
    let sinceEstimate = 0
    let displayedSeconds = 0
    let totalSeconds = 0
    let firstShownAt = null
    const confidences = []
    for (let i = 0; i < samples.length; i += chunk) {
      tracker.push(samples.subarray(i, i + chunk))
      sinceEstimate += chunk
      if (sinceEstimate >= perSecond) {
        sinceEstimate = 0
        totalSeconds += 1
        const estimate = tracker.estimate()
        if (estimate) confidences.push(estimate.confidence)
        const shown = gate.push(estimate)
        if (shown !== null) {
          displayedSeconds += 1
          firstShownAt ??= totalSeconds
        }
      }
    }

    const final = gate.current()
    const spread =
      confidences.length === 0
        ? 'none'
        : `${Math.min(...confidences).toFixed(2)}–${Math.max(...confidences).toFixed(2)}`
    console.log(
      `${entry.file.padEnd(16)} librosa ${String(entry.librosa_bpm).padStart(6)}` +
        ` | shown ${final === null ? '     —' : final.toFixed(1).padStart(6)}` +
        ` | confidence ${spread}` +
        ` | displayed ${displayedSeconds}/${totalSeconds}s` +
        ` | first at ${firstShownAt ?? '—'}s`,
    )

    if (entry.rhythmic) {
      expect(final).not.toBeNull()
      expect(octaveMatches(final, entry.librosa_bpm)).toBe(true)
    } else {
      expect(final).toBeNull()
    }
  })
})
