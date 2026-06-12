import { describe, expect, it } from 'vitest'

import {
  BEND_CATCH_UP_SECONDS,
  bendConsumed,
  bendPlan,
  clampOffset,
  clampRate,
  MAX_BEND_FRACTION,
  NUDGE_BEND_FRACTION,
  phaseOffsetBeats,
  positionAt,
  tempoSliderToRate,
  trackPeaks,
  TRACK_RATE_RANGE,
} from './track'

describe('positionAt', () => {
  it('holds the parked offset while paused', () => {
    expect(positionAt({ state: 'paused', offset: 12.5 }, 100, 60)).toBe(12.5)
  })

  it('advances with context time while playing', () => {
    const transport = {
      state: 'playing',
      offset: 10,
      startedAt: 50,
      rate: 1,
    } as const
    expect(positionAt(transport, 53.25, 60)).toBe(13.25)
  })

  it('advances at the varispeed rate (M20)', () => {
    const transport = {
      state: 'playing',
      offset: 10,
      startedAt: 50,
      rate: 1.05,
    } as const
    expect(positionAt(transport, 52, 60)).toBeCloseTo(12.1)
  })

  it('clamps to the track end — a source that ran past its stop never reads beyond', () => {
    const transport = {
      state: 'playing',
      offset: 55,
      startedAt: 0,
      rate: 1,
    } as const
    expect(positionAt(transport, 30, 60)).toBe(60)
  })

  it('parks at the end once ended', () => {
    expect(positionAt({ state: 'ended', offset: 60 }, 999, 60)).toBe(60)
  })
})

describe('clampRate', () => {
  it('passes rates inside the varispeed range', () => {
    expect(clampRate(1.05)).toBe(1.05)
  })

  it('clamps to the ±8% envelope and sends garbage to unity', () => {
    expect(clampRate(1.5)).toBe(1 + TRACK_RATE_RANGE)
    expect(clampRate(0.5)).toBe(1 - TRACK_RATE_RANGE)
    expect(clampRate(Number.NaN)).toBe(1)
  })
})

describe('bend arithmetic', () => {
  it('plans a single-tick slip at the gentle minimum bend', () => {
    const plan = bendPlan(0.01, 1)
    expect(plan.rate).toBeCloseTo(1 + NUDGE_BEND_FRACTION)
    // 10ms of slip at a 5% bend takes 200ms.
    expect(plan.durationSeconds).toBeCloseTo(0.2)
  })

  it('plans a backward slip as a slower bend', () => {
    const plan = bendPlan(-0.01, 1)
    expect(plan.rate).toBeCloseTo(1 - NUDGE_BEND_FRACTION)
    expect(plan.durationSeconds).toBeCloseTo(0.2)
  })

  it('steepens with the backlog so catch-up time stays bounded', () => {
    // 100ms of slip would crawl for 2s at the minimum bend; instead
    // the bend scales to clear it in the catch-up target.
    const moderate = bendPlan(0.1, 1)
    expect(moderate.rate).toBeCloseTo(1.4)
    expect(moderate.durationSeconds).toBeCloseTo(BEND_CATCH_UP_SECONDS)
    // A spin's backlog hits the steepness cap and takes longer, but
    // never the 20s a fixed 5% would have spent on a 1s slip.
    const spin = bendPlan(1, 1)
    expect(spin.rate).toBeCloseTo(1 + MAX_BEND_FRACTION)
    expect(spin.durationSeconds).toBeCloseTo(2)
  })

  it('scales the bend with the base rate so slip stays exact under varispeed', () => {
    const plan = bendPlan(0.01, 1.08)
    expect(plan.rate).toBeCloseTo(1.08 * (1 + NUDGE_BEND_FRACTION))
    expect(plan.durationSeconds).toBeCloseTo(0.01 / (1.08 * NUDGE_BEND_FRACTION))
  })

  it('settles what an interrupted bend already consumed', () => {
    const plan = bendPlan(0.01, 1)
    // Half the duration in: half the slip is consumed.
    expect(
      bendConsumed(plan.durationSeconds / 2, 1, plan.rate),
    ).toBeCloseTo(0.005)
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

describe('tempoSliderToRate', () => {
  it('maps centre to unity and the ends to the envelope edges (orientation measured on device)', () => {
    expect(tempoSliderToRate(0.5)).toBeCloseTo(1)
    expect(tempoSliderToRate(0)).toBeCloseTo(1 - TRACK_RATE_RANGE)
    expect(tempoSliderToRate(1)).toBeCloseTo(1 + TRACK_RATE_RANGE)
  })
})

describe('phaseOffsetBeats', () => {
  const clock = (beatAtContext: number, periodSeconds = 0.5) => ({
    beatAtContext,
    periodSeconds,
  })

  it('is zero when the beats coincide on the lattice', () => {
    expect(phaseOffsetBeats(clock(10), clock(10))).toBeCloseTo(0)
    expect(phaseOffsetBeats(clock(12.5), clock(10))).toBeCloseTo(0)
  })

  it('reports a late deck as a positive fraction of a beat', () => {
    expect(phaseOffsetBeats(clock(10.1), clock(10))).toBeCloseTo(0.2)
  })

  it('wraps to the nearest direction', () => {
    expect(phaseOffsetBeats(clock(10.45), clock(10))).toBeCloseTo(-0.1)
  })
})
