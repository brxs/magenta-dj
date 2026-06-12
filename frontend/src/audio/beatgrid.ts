/** Offline beatgrid for a decoded track (M20, ADR-0014): BPM plus
 * first-beat phase under a constant-tempo model, behind the M14
 * honesty rule — a track that won't fit a grid gets null, never a
 * wrong grid. Pure math over the decoded channels, unit-tested
 * against click tracks and drifting fixtures.
 *
 * The estimator's coarse BPM is only good to ~±1–2 %, and folding a
 * whole track with a period that far off smears a full beat of phase
 * every ~50 s — so the period is refined here: a fine rate search
 * around the coarse BPM maximising fold concentration, with the
 * fold's spread and a half-split phase agreement as the drift check
 * (the regression-residual idea from ADR-0014 in search form). */

import { trackBpm } from './beat'

export type Beatgrid = {
  bpm: number
  /** Where beat 0 falls, in seconds from the start of the track. */
  firstBeatSeconds: number
}

const HOP_FRAMES = 512
const EPS = 1e-10
// Honesty thresholds, measured against the synthetic corpus in
// beatgrid.test.ts: a steady click track folds to a resultant near
// 1.0; noise and drifting material fall well under the floor or
// fail the half-split agreement. The resultant (mean unit-vector
// length) is the search metric because it peaks exactly at the true
// period — a windowed-mass count plateaus across nearby periods and
// lets the search pick a drifting edge.
const MIN_ONSETS = 16
const MIN_RESULTANT = 0.7
/** Fine search around the coarse BPM: ±2 % covers the estimator's
 * tolerance band, steps small enough that residual smear over a
 * 6-minute track stays under a tenth of a beat. */
const RATE_SEARCH = 0.02
const RATE_STEP = 0.0005
/** First and second half of the track must agree on phase within
 * this fraction of a period, or the tempo drifted — no grid. */
const HALF_AGREEMENT = 0.15

type Onset = { hop: number; weight: number }

/** Half-wave-rectified log-energy flux per hop on the mono mix — the
 * estimator's onset recipe, run offline over the whole buffer. */
function onsetEnvelope(left: Float32Array, right: Float32Array): Float32Array {
  const hops = Math.floor(left.length / HOP_FRAMES)
  const envelope = new Float32Array(hops)
  let previousLog: number | null = null
  for (let hop = 0; hop < hops; hop++) {
    let energy = 0
    const start = hop * HOP_FRAMES
    for (let i = start; i < start + HOP_FRAMES; i++) {
      const mono = (left[i] + right[i]) / 2
      energy += mono * mono
    }
    const log = Math.log(energy + EPS)
    if (previousLog !== null) {
      envelope[hop] = Math.max(0, log - previousLog)
    }
    previousLog = log
  }
  return envelope
}

/** Local maxima above an adaptive floor, weighted by their strength. */
function pickOnsets(envelope: Float32Array): Onset[] {
  let sum = 0
  for (const value of envelope) sum += value
  const mean = sum / Math.max(1, envelope.length)
  let variance = 0
  for (const value of envelope) variance += (value - mean) ** 2
  const floor = mean + Math.sqrt(variance / Math.max(1, envelope.length))
  const onsets: Onset[] = []
  for (let hop = 1; hop < envelope.length - 1; hop++) {
    const value = envelope[hop]
    if (
      value > floor &&
      value >= envelope[hop - 1] &&
      value > envelope[hop + 1]
    ) {
      onsets.push({ hop, weight: value })
    }
  }
  return onsets
}

/** Weighted circular mean of phases (turns, 0..1); null when the
 * vectors cancel (no coherent phase). */
function circularMean(phases: number[], weights: number[]): number | null {
  let x = 0
  let y = 0
  for (let i = 0; i < phases.length; i++) {
    const angle = 2 * Math.PI * phases[i]
    x += Math.cos(angle) * weights[i]
    y += Math.sin(angle) * weights[i]
  }
  if (Math.hypot(x, y) < EPS) return null
  const turns = Math.atan2(y, x) / (2 * Math.PI)
  return (turns + 1) % 1
}

/** Shortest circular distance between two phases, in turns. */
function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1
  return Math.min(diff, 1 - diff)
}

/** Fold the onsets by a candidate period: the weighted resultant
 * length (0 = incoherent, 1 = every onset on one phase) and the mean
 * phase. */
function foldResultant(
  onsets: Onset[],
  periodHops: number,
): { resultant: number; phase: number } | null {
  let x = 0
  let y = 0
  let total = 0
  for (const onset of onsets) {
    const angle = 2 * Math.PI * ((onset.hop / periodHops) % 1)
    x += Math.cos(angle) * onset.weight
    y += Math.sin(angle) * onset.weight
    total += onset.weight
  }
  if (total < EPS) return null
  const turns = Math.atan2(y, x) / (2 * Math.PI)
  return { resultant: Math.hypot(x, y) / total, phase: (turns + 1) % 1 }
}

export function trackBeatgrid(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  // The caller usually has the coarse pass already (loadTrack runs
  // trackBpm for the readout) — accept it so the track is analysed
  // once, not twice.
  coarse?: number | null,
): Beatgrid | null {
  const coarseBpm = coarse ?? trackBpm(left, right, sampleRate)
  if (coarseBpm === null) return null
  const envelope = onsetEnvelope(left, right)
  const onsets = pickOnsets(envelope)
  if (onsets.length < MIN_ONSETS) return null

  const hopSeconds = HOP_FRAMES / sampleRate
  const coarsePeriodHops = 60 / coarseBpm / hopSeconds
  let best: { periodHops: number; resultant: number; phase: number } | null =
    null
  for (
    let rate = 1 - RATE_SEARCH;
    rate <= 1 + RATE_SEARCH + EPS;
    rate += RATE_STEP
  ) {
    const periodHops = coarsePeriodHops / rate
    const fold = foldResultant(onsets, periodHops)
    if (fold && (best === null || fold.resultant > best.resultant)) {
      best = { periodHops, ...fold }
    }
  }
  if (best === null || best.resultant < MIN_RESULTANT) return null

  // The drift check: both halves of the material must put beat 0 in
  // the same place. A tempo change or creeping phase fails here even
  // when each half folds tightly on its own.
  const midpoint = onsets[Math.floor(onsets.length / 2)].hop
  const firstHalf = onsets.filter((onset) => onset.hop < midpoint)
  const secondHalf = onsets.filter((onset) => onset.hop >= midpoint)
  const phaseOf = (half: Onset[]) =>
    circularMean(
      half.map((onset) => (onset.hop / best.periodHops) % 1),
      half.map((onset) => onset.weight),
    )
  const firstPhase = phaseOf(firstHalf)
  const secondPhase = phaseOf(secondHalf)
  if (
    firstPhase === null ||
    secondPhase === null ||
    circularDistance(firstPhase, secondPhase) > HALF_AGREEMENT
  ) {
    return null
  }

  const periodSeconds = best.periodHops * hopSeconds
  return {
    bpm: 60 / periodSeconds,
    firstBeatSeconds: best.phase * periodSeconds,
  }
}
