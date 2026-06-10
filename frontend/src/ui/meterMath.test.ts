import { describe, expect, it } from 'vitest'

import { litSegments, segmentTone } from './meterMath'

describe('litSegments', () => {
  it('is dark at silence and full at hot levels', () => {
    expect(litSegments(0, 12)).toBe(0)
    expect(litSegments(0.5, 12)).toBe(12)
  })

  it('spreads quiet levels across the column', () => {
    const quiet = litSegments(0.05, 12)
    expect(quiet).toBeGreaterThan(2)
    expect(quiet).toBeLessThan(7)
  })

  it('clamps out-of-range input', () => {
    expect(litSegments(-1, 12)).toBe(0)
    expect(litSegments(5, 12)).toBe(12)
  })
})

describe('segmentTone', () => {
  it('colours the column green, amber on top, red at the peak', () => {
    const tones = Array.from({ length: 10 }, (_, i) => segmentTone(i, 10))
    expect(tones.slice(0, 7)).toEqual(Array(7).fill('ok'))
    expect(tones[7]).toBe('warn')
    expect(tones[8]).toBe('warn')
    expect(tones[9]).toBe('danger')
  })
})
