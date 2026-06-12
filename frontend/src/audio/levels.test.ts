import { describe, expect, it } from 'vitest'

import { rmsFromBytes } from './levels'

describe('rmsFromBytes', () => {
  it('is zero for silence (all 128) and empty windows', () => {
    expect(rmsFromBytes(new Uint8Array(64).fill(128))).toBe(0)
    expect(rmsFromBytes(new Uint8Array(0))).toBe(0)
  })

  it('approaches 1 for a full-scale square wave', () => {
    const bytes = new Uint8Array(64)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 2 ? 0 : 255
    expect(rmsFromBytes(bytes)).toBeCloseTo(1, 1)
  })

  it('scales with amplitude', () => {
    const half = new Uint8Array(64)
    for (let i = 0; i < half.length; i++) half[i] = i % 2 ? 64 : 192
    expect(rmsFromBytes(half)).toBeCloseTo(0.5, 1)
  })
})
