/** Pure math over AnalyserNode byte time-domain data (128 = zero). */

/** RMS level of a byte window, 0..~1. */
export function rmsFromBytes(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0
  let sum = 0
  for (let i = 0; i < bytes.length; i++) {
    const sample = (bytes[i] - 128) / 128
    sum += sample * sample
  }
  return Math.sqrt(sum / bytes.length)
}
