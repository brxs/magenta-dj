import { describe, expect, it } from 'vitest'

import { clampOffset, positionAt, trackPeaks } from './track'

describe('positionAt', () => {
  it('holds the parked offset while paused', () => {
    expect(positionAt({ state: 'paused', offset: 12.5 }, 100, 60)).toBe(12.5)
  })

  it('advances with context time while playing', () => {
    const transport = { state: 'playing', offset: 10, startedAt: 50 } as const
    expect(positionAt(transport, 53.25, 60)).toBe(13.25)
  })

  it('clamps to the track end — a source that ran past its stop never reads beyond', () => {
    const transport = { state: 'playing', offset: 55, startedAt: 0 } as const
    expect(positionAt(transport, 30, 60)).toBe(60)
  })

  it('parks at the end once ended', () => {
    expect(positionAt({ state: 'ended', offset: 60 }, 999, 60)).toBe(60)
  })
})

describe('clampOffset', () => {
  it('passes a position inside the track through', () => {
    expect(clampOffset(30, 60)).toBe(30)
  })

  it('clamps past-the-end to the end', () => {
    expect(clampOffset(75, 60)).toBe(60)
  })

  it('sends negatives and non-finite garbage to the top', () => {
    expect(clampOffset(-3, 60)).toBe(0)
    expect(clampOffset(Number.NaN, 60)).toBe(0)
    expect(clampOffset(Infinity, 60)).toBe(0)
  })
})

describe('trackPeaks', () => {
  it('finds the min/max envelope per bucket across both channels', () => {
    // Float32-exact values, so the assertions compare cleanly.
    const left = Float32Array.from([0.5, -0.25, 0.125, 0.75])
    const right = Float32Array.from([-0.625, 0.25, -0.0625, 0.375])
    const { min, max } = trackPeaks(left, right, 2)
    expect(Array.from(min)).toEqual([-0.625, -0.0625])
    expect(Array.from(max)).toEqual([0.5, 0.75])
  })

  it('covers every frame when buckets do not divide the length', () => {
    const left = Float32Array.from([0, 0, 1])
    const right = Float32Array.from([0, 0, -1])
    const { min, max } = trackPeaks(left, right, 2)
    // The last frame's extremes must land in the final bucket.
    expect(max[1]).toBe(1)
    expect(min[1]).toBe(-1)
  })

  it('returns silent envelopes for an empty buffer', () => {
    const { min, max } = trackPeaks(new Float32Array(0), new Float32Array(0), 3)
    expect(Array.from(min)).toEqual([0, 0, 0])
    expect(Array.from(max)).toEqual([0, 0, 0])
  })
})
