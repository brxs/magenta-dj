/** Pure transport math for a playback-mode deck (M19, ADR-0013). An
 * AudioBufferSourceNode can neither pause nor report a playhead, so the
 * channel anchors an offset against context time and derives the rest
 * here — unit-tested, no Web Audio in sight. */

export type TrackTransport =
  | { state: 'paused'; offset: number }
  | { state: 'playing'; offset: number; startedAt: number; rate: number }
  | { state: 'ended'; offset: number }

/** The playhead in seconds, clamped into the track. While playing it
 * advances at `rate` track-seconds per context-second (varispeed,
 * M20); the channel re-anchors on every rate change, so this stays
 * exact across changes and bends. */
export function positionAt(
  transport: TrackTransport,
  now: number,
  duration: number,
): number {
  const raw =
    transport.state === 'playing'
      ? transport.offset + (now - transport.startedAt) * transport.rate
      : transport.offset
  return Math.min(Math.max(raw, 0), duration)
}

/** Varispeed bounds (ADR-0014): ±8 %, the classic DJ envelope. */
export const TRACK_RATE_RANGE = 0.08

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1
  return Math.min(Math.max(rate, 1 - TRACK_RATE_RANGE), 1 + TRACK_RATE_RANGE)
}

/** The phase nudge's minimum bend strength: a single tick stays this
 * gentle (ADR-0014 — the platter-drag metaphor). */
export const NUDGE_BEND_FRACTION = 0.05
/** The steepest bend a backlog may demand — beyond this the slip
 * queue caps instead (MAX_PENDING_SLIP_SECONDS). */
export const MAX_BEND_FRACTION = 0.5
/** Slip beyond what the minimum bend clears in this time bends
 * steeper, so a platter turn answers in bounded time. At a fixed 5 %
 * the jog consumed 50 ms of slip per real second — a spin piled up
 * seconds of backlog and read as "the jog doesn't move anything"
 * (second device run). */
export const BEND_CATCH_UP_SECONDS = 0.25
/** The deepest slip backlog worth keeping: a platter is a phase
 * tool, not a seek — drop what a release would spend seconds
 * grinding through. */
export const MAX_PENDING_SLIP_SECONDS = 1

/** Plan a stepped bend that slips `slipSeconds` of phase: the bent
 * rate to hold and for how long. Positive slip pushes the playhead
 * ahead (briefly faster), negative drags it back. The bend steepens
 * with the backlog so catch-up time stays bounded. */
export function bendPlan(
  slipSeconds: number,
  baseRate: number,
): { rate: number; durationSeconds: number } {
  const direction = slipSeconds >= 0 ? 1 : -1
  const fraction = Math.min(
    MAX_BEND_FRACTION,
    Math.max(
      NUDGE_BEND_FRACTION,
      Math.abs(slipSeconds) / (baseRate * BEND_CATCH_UP_SECONDS),
    ),
  )
  return {
    rate: baseRate * (1 + direction * fraction),
    durationSeconds: Math.abs(slipSeconds) / (baseRate * fraction),
  }
}

/** Phase slipped after `elapsed` seconds bent to `bentRate` against
 * `baseRate` — what a bend interrupted mid-flight already consumed. */
export function bendConsumed(
  elapsedSeconds: number,
  baseRate: number,
  bentRate: number,
): number {
  return (bentRate - baseRate) * elapsedSeconds
}

/** Where a seek lands: clamped into the track, garbage to the top. */
export function clampOffset(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.min(seconds, duration)
}

/** An active loop region in track seconds (M21, ADR-0015). */
export type TrackLoop = { start: number; end: number }

/** The shortest honest loop: sub-quantum regions are where Web Audio
 * implementations differ, and a near-zero loop is a buzz, not a loop.
 * Only bites without a grid — a gridded loop owes a whole beat. */
export const MIN_TRACK_LOOP_SECONDS = 0.05

/** Fold a linearly-derived playhead into an active loop: linear until
 * the region's end, then wrapping — the same path the audio takes
 * through the source's native loop, so every position consumer stays
 * truthful inside it. A playhead already past the end (a quantised
 * OUT can land just behind the press) wraps exactly like the source
 * does on its next position check. */
export function foldIntoLoop(seconds: number, loop: TrackLoop): number {
  if (seconds < loop.end) return seconds
  return loop.start + ((seconds - loop.end) % (loop.end - loop.start))
}

/** Nearest grid beat (M21 quantise): cues and loop points snap onto
 * the lattice while a grid is confident. No grid, no snap — the
 * position passes through free (the M14 consumer rule). */
export function snapToGrid(
  seconds: number,
  grid: { bpm: number; firstBeatSeconds: number } | null,
): number {
  if (!grid) return seconds
  const period = 60 / grid.bpm
  // Beats before the first don't exist on the lattice — the top of
  // the track snaps forward to beat one, never to a phantom.
  const k = Math.max(
    0,
    Math.round((seconds - grid.firstBeatSeconds) / period),
  )
  return grid.firstBeatSeconds + k * period
}

/** What setting a loop does to the transport (M21, ADR-0015) — the
 * decision is pure so the spec-edge branches the architecture review
 * demanded are unit-tested, with the engine only executing them:
 * - `refuse`: a region that cannot honestly loop, or a deck parked at
 *   its end (nothing is rolling; a stored loop would contradict the
 *   parked readout).
 * - `restart` (playing, playhead at/past the new end — a late OUT
 *   snapping backwards): restart the source inside the region rather
 *   than trusting the wrap-on-reach edge.
 * - `reanchor` (playing): pin the anchor on the audible position so
 *   the linear raw history can't fight the new fold.
 * - `park` (paused past the end): fold the parked offset in, so a
 *   later resume starts deterministically inside the region.
 * - `apply` (paused, inside): just set it. */
export type LoopSetPlan =
  | { action: 'refuse' }
  | { action: 'restart'; offset: number }
  | { action: 'reanchor'; offset: number }
  | { action: 'park'; offset: number }
  | { action: 'apply' }

export function planLoopSet(
  state: TrackTransport['state'],
  position: number,
  start: number,
  end: number,
  duration: number,
): LoopSetPlan {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { action: 'refuse' }
  if (start < 0 || end > duration || end - start < MIN_TRACK_LOOP_SECONDS) {
    return { action: 'refuse' }
  }
  if (state === 'ended') return { action: 'refuse' }
  const loop = { start, end }
  if (state === 'playing') {
    return position >= end
      ? { action: 'restart', offset: foldIntoLoop(position, loop) }
      : { action: 'reanchor', offset: position }
  }
  return position >= end
    ? { action: 'park', offset: foldIntoLoop(position, loop) }
    : { action: 'apply' }
}

/** Build the loop region from IN and OUT presses: both ends snapped
 * while a grid is confident, the end then owing at least one beat
 * (an OUT on the IN's beat means the next one — a loop must loop).
 * Without a grid the region is free but must still run forward.
 * Returns null when no honest region exists. */
export function quantisedLoop(
  inSeconds: number,
  outSeconds: number,
  grid: { bpm: number; firstBeatSeconds: number } | null,
  duration: number,
): TrackLoop | null {
  const start = snapToGrid(clampOffset(inSeconds, duration), grid)
  let end = snapToGrid(clampOffset(outSeconds, duration), grid)
  if (grid) {
    const period = 60 / grid.bpm
    if (end < start + period) end = start + period
  }
  if (end > duration) end = duration
  if (!(end - start >= MIN_TRACK_LOOP_SECONDS)) return null
  return { start, end }
}

/** Min/max envelope per bucket across both channels — the static
 * overview a decoded track can afford that the live stream cannot.
 * Buckets cover the buffer evenly; a short final bucket still counts. */
export function trackPeaks(
  left: Float32Array,
  right: Float32Array,
  buckets: number,
): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(buckets)
  const max = new Float32Array(buckets)
  const frames = left.length
  if (frames === 0 || buckets === 0) return { min, max }
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * frames) / buckets)
    const end = Math.max(Math.floor(((bucket + 1) * frames) / buckets), start + 1)
    let lo = Infinity
    let hi = -Infinity
    for (let i = start; i < end && i < frames; i++) {
      const l = left[i]
      const r = right[i]
      if (l < lo) lo = l
      if (r < lo) lo = r
      if (l > hi) hi = l
      if (r > hi) hi = r
    }
    min[bucket] = lo === Infinity ? 0 : lo
    max[bucket] = hi === -Infinity ? 0 : hi
  }
  return { min, max }
}

/** Map the FLX4 tempo slider (14-bit, 0..1) onto the varispeed range.
 * Orientation MEASURED on the device (M20 checklist): this firmware
 * sends low values at the slow end — the opposite of the chart
 * assumption, which shipped inverted and was caught on hardware. */
export function tempoSliderToRate(value: number): number {
  return clampRate(1 + (value - 0.5) * 2 * TRACK_RATE_RANGE)
}

/** Phase offset between two beat clocks, wrapped to [-0.5, 0.5)
 * beats — what the phase meter shows. */
export function phaseOffsetBeats(
  a: { periodSeconds: number; beatAtContext: number },
  b: { periodSeconds: number; beatAtContext: number },
): number {
  const raw = (a.beatAtContext - b.beatAtContext) / b.periodSeconds
  return ((((raw % 1) + 1) % 1) + 0.5) % 1 - 0.5
}
