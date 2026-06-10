/** Minimal WAV (RIFF, 16-bit PCM) encoding for session recordings. */

/** Convert interleaved float32 samples in [-1, 1] to 16-bit PCM. */
export function floatToInt16(samples: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.min(1, Math.max(-1, samples[i]))
    out[i] = Math.round(clamped * 32767)
  }
  return out
}

/** Assemble interleaved int16 chunks into a complete WAV file. */
export function encodeWav(
  chunks: Int16Array<ArrayBuffer>[],
  sampleRate: number,
  channels: number,
): Blob {
  const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const dataBytes = totalSamples * 2
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true) // byte rate
  view.setUint16(32, channels * 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  return new Blob([header, ...chunks], { type: 'audio/wav' })
}
