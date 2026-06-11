/** Beat detection (M14): a pure, incremental tempo estimator over a
 * deck's PCM feed, and the honesty gate in front of it. ADR-0004
 * stands — tempo is not a generation parameter; this only *measures*
 * the output. The estimator must say nothing rather than a wrong
 * number, so the gate demands both periodicity (confidence) and
 * stability across successive estimates before anything is shown.
 *
 * Shape: an onset envelope (half-wave-rectified log-energy flux per
 * hop) autocorrelated over the DJ tempo range; the best lag wins by a
 * comb score (a true beat period also correlates at its double) under
 * a mild log-normal prior centred near club tempo, which breaks the
 * octave ties a pure comb score leaves. Confidence is the raw
 * autocorrelation coefficient at the winning lag — periodicity, not
 * prior. Thresholds are measured, not guessed: see
 * docs/spike-beat-detection.md. */

export type BeatEstimate = { bpm: number; confidence: number }

export type BeatTracker = {
  /** Feed interleaved stereo float32 — the deck wire format. */
  push: (samples: Float32Array) => void
  /** Latest estimate, or null while there is too little signal. */
  estimate: () => BeatEstimate | null
  /** Drop accumulated signal (stream reset / model switch). */
  reset: () => void
}

const HOP_FRAMES = 512
const WINDOW_SECONDS = 12
const MIN_SECONDS = 6
const MIN_BPM = 60
const MAX_BPM = 200
/** Octave ties break toward this tempo (log-normal prior). */
const PRIOR_CENTER_BPM = 120
const PRIOR_OCTAVE_SIGMA = 0.7
const EPS = 1e-10
/** Envelope variance below this is not rhythm. Flux lives in
 * log-energy units, so the floor is volume-invariant: a kick onset
 * rises by whole nats; a steady tone's hop-quantisation ripple sits
 * orders of magnitude under this. */
const MIN_FLUX_VARIANCE = 1e-4
/** Sharp transients put a 1–2 hop spike in the envelope, which makes
 * a non-integer true lag (150 bpm = 37.5 hops) lose to its
 * integer-lag octave alias. Smoothing spreads each onset across
 * neighbouring hops so half-integer lags still correlate. */
const SMOOTHING = [0.25, 0.5, 1, 0.5, 0.25]

function tempoPrior(bpm: number): number {
  const octaves = Math.log2(bpm / PRIOR_CENTER_BPM)
  return Math.exp(-0.5 * (octaves / PRIOR_OCTAVE_SIGMA) ** 2)
}

export function createBeatTracker(sampleRate: number): BeatTracker {
  const hopSeconds = HOP_FRAMES / sampleRate
  const capacity = Math.max(16, Math.round(WINDOW_SECONDS / hopSeconds))
  const flux = new Float32Array(capacity)
  let head = 0
  let filled = 0
  let hopEnergy = 0
  let hopFill = 0
  let previousLogEnergy: number | null = null

  function pushHop(energy: number) {
    const logEnergy = Math.log(energy + EPS)
    if (previousLogEnergy !== null) {
      flux[head] = Math.max(0, logEnergy - previousLogEnergy)
      head = (head + 1) % capacity
      filled = Math.min(filled + 1, capacity)
    }
    previousLogEnergy = logEnergy
  }

  return {
    push(samples) {
      for (let i = 0; i + 1 < samples.length; i += 2) {
        const mono = (samples[i] + samples[i + 1]) / 2
        hopEnergy += mono * mono
        hopFill += 1
        if (hopFill === HOP_FRAMES) {
          pushHop(hopEnergy / HOP_FRAMES)
          hopEnergy = 0
          hopFill = 0
        }
      }
    },

    estimate() {
      if (filled * hopSeconds < MIN_SECONDS) return null
      // Linearise the ring oldest-first, smooth, then remove the mean.
      const n = filled
      const raw = new Float32Array(n)
      const start = (head - filled + capacity) % capacity
      for (let i = 0; i < n; i++) raw[i] = flux[(start + i) % capacity]
      const x = new Float32Array(n)
      const half = (SMOOTHING.length - 1) / 2
      let mean = 0
      for (let i = 0; i < n; i++) {
        let sum = 0
        let weight = 0
        for (let k = 0; k < SMOOTHING.length; k++) {
          const j = i + k - half
          if (j < 0 || j >= n) continue
          sum += raw[j] * SMOOTHING[k]
          weight += SMOOTHING[k]
        }
        x[i] = sum / weight
        mean += x[i]
      }
      mean /= n
      let r0 = 0
      for (let i = 0; i < n; i++) {
        x[i] -= mean
        r0 += x[i] * x[i]
      }
      // A flat envelope (silence, a steady tone, a beatless pad) has
      // no rhythm worth reporting.
      if (r0 / n < MIN_FLUX_VARIANCE) return null

      const lagMin = Math.max(2, Math.floor(60 / (MAX_BPM * hopSeconds)))
      const lagMax = Math.min(n - 2, Math.ceil(60 / (MIN_BPM * hopSeconds)))
      if (lagMax <= lagMin) return null
      // Coefficients run to 2×lagMax so every candidate can consult
      // its harmonic; unbiased normalisation keeps long lags honest.
      const lagTop = Math.min(2 * lagMax, n - 2)
      const coeff = new Float32Array(lagTop + 1)
      for (let lag = lagMin; lag <= lagTop; lag++) {
        let sum = 0
        for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag]
        coeff[lag] = sum / (n - lag) / (r0 / n)
      }

      let bestLag = 0
      let bestScore = -Infinity
      for (let lag = lagMin; lag <= lagMax; lag++) {
        const harmonic = 2 * lag <= lagTop ? coeff[2 * lag] : 0
        // A candidate whose HALF lag also correlates is the octave-down
        // alias of a faster beat — penalise it so the true tempo wins
        // (the prior alone can't break this tie).
        const lower = Math.floor(lag / 2)
        const subharmonic =
          lower >= lagMin
            ? (coeff[lower] + coeff[Math.min(lower + 1, lagTop)]) / 2
            : 0
        const score =
          (coeff[lag] + 0.5 * harmonic - 0.5 * subharmonic) *
          tempoPrior(60 / (lag * hopSeconds))
        if (score > bestScore) {
          bestScore = score
          bestLag = lag
        }
      }
      if (bestLag === 0) return null

      // Parabolic interpolation for sub-hop lag resolution (±5% per
      // hop at club tempo would otherwise swamp the ±2% target).
      const alpha = coeff[bestLag - 1]
      const beta = coeff[bestLag]
      const gamma = coeff[bestLag + 1]
      const denominator = alpha - 2 * beta + gamma
      const shift =
        denominator === 0
          ? 0
          : Math.max(-0.5, Math.min(0.5, (0.5 * (alpha - gamma)) / denominator))
      const bpm = 60 / ((bestLag + shift) * hopSeconds)
      const confidence = Math.max(0, Math.min(1, beta))
      return { bpm, confidence }
    },

    reset() {
      head = 0
      filled = 0
      hopEnergy = 0
      hopFill = 0
      previousLogEnergy = null
    },
  }
}

/** The honesty gate: a BPM is shown only after `GATE_STABLE_COUNT`
 * consecutive confident estimates agreeing within `GATE_TOLERANCE`.
 * One unconfident estimate drops the readout — stale numbers lie. */
export const GATE_MIN_CONFIDENCE = 0.4
export const GATE_STABLE_COUNT = 3
export const GATE_TOLERANCE = 0.04

export type BeatGate = {
  /** Feed the latest estimate; returns what may be displayed now. */
  push: (estimate: BeatEstimate | null) => number | null
  current: () => number | null
}

export function createBeatGate(): BeatGate {
  const recent: number[] = []
  let displayed: number | null = null
  return {
    push(estimate) {
      if (!estimate || estimate.confidence < GATE_MIN_CONFIDENCE) {
        recent.length = 0
        displayed = null
        return null
      }
      recent.push(estimate.bpm)
      if (recent.length > GATE_STABLE_COUNT) recent.shift()
      if (recent.length < GATE_STABLE_COUNT) {
        displayed = null
        return null
      }
      const sorted = [...recent].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const stable = sorted[sorted.length - 1] - sorted[0] <= median * GATE_TOLERANCE
      displayed = stable ? median : null
      return displayed
    },
    current: () => displayed,
  }
}
