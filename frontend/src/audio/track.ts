/** Pure transport math for a playback-mode deck (M19, ADR-0013). An
 * AudioBufferSourceNode can neither pause nor report a playhead, so the
 * channel anchors an offset against context time and derives the rest
 * here — unit-tested, no Web Audio in sight. */

export type TrackTransport =
  | { state: 'paused'; offset: number }
  | { state: 'playing'; offset: number; startedAt: number }
  | { state: 'ended'; offset: number }

/** The playhead in seconds, clamped into the track. */
export function positionAt(
  transport: TrackTransport,
  now: number,
  duration: number,
): number {
  const raw =
    transport.state === 'playing'
      ? transport.offset + (now - transport.startedAt)
      : transport.offset
  return Math.min(Math.max(raw, 0), duration)
}

/** Where a seek lands: clamped into the track, garbage to the top. */
export function clampOffset(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.min(seconds, duration)
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
