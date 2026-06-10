import { describe, expect, it } from 'vitest'

import { encodeWav, floatToInt16 } from './wav'

describe('floatToInt16', () => {
  it('scales and clamps the float range', () => {
    const out = floatToInt16(new Float32Array([0, 1, -1, 2, -2, 0.5]))
    expect(Array.from(out)).toEqual([0, 32767, -32767, 32767, -32767, 16384])
  })
})

describe('encodeWav', () => {
  it('writes a valid 16-bit stereo RIFF header and the sample data', async () => {
    const chunkA = new Int16Array([1, 2, 3, 4])
    const chunkB = new Int16Array([5, 6])
    const blob = encodeWav([chunkA, chunkB], 48_000, 2)
    const bytes = new DataView(await blob.arrayBuffer())

    const ascii = (offset: number, length: number) =>
      Array.from({ length }, (_, i) =>
        String.fromCharCode(bytes.getUint8(offset + i)),
      ).join('')

    expect(blob.type).toBe('audio/wav')
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(bytes.getUint16(22, true)).toBe(2) // channels
    expect(bytes.getUint32(24, true)).toBe(48_000) // sample rate
    expect(bytes.getUint16(34, true)).toBe(16) // bit depth
    expect(bytes.getUint32(40, true)).toBe(12) // data bytes: 6 samples * 2
    expect(bytes.getInt16(44, true)).toBe(1) // first sample
    expect(bytes.getInt16(54, true)).toBe(6) // last sample
    expect(blob.size).toBe(44 + 12)
  })
})
