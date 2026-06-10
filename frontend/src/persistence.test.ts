import { beforeEach, describe, expect, it } from 'vitest'

import {
  loadAppSettings,
  loadDeckSettings,
  updateAppSettings,
  updateDeckSettings,
} from './persistence'

beforeEach(() => localStorage.clear())

describe('persistence', () => {
  it('round-trips deck settings and merges partial updates', () => {
    updateDeckSettings('a', {
      targets: [{ text: 'funk', x: 0.5, y: 0.12 }],
      cursor: { x: 0.4, y: 0.6 },
    })
    updateDeckSettings('a', { volume: 0.6 })
    expect(loadDeckSettings('a')).toEqual({
      targets: [{ text: 'funk', x: 0.5, y: 0.12 }],
      cursor: { x: 0.4, y: 0.6 },
      volume: 0.6,
    })
  })

  it('keeps decks independent', () => {
    updateDeckSettings('a', { volume: 0.2 })
    updateDeckSettings('b', { volume: 0.9 })
    expect(loadDeckSettings('a').volume).toBe(0.2)
    expect(loadDeckSettings('b').volume).toBe(0.9)
  })

  it('round-trips app settings', () => {
    updateAppSettings({ crossfade: 0.8 })
    expect(loadAppSettings()).toEqual({ crossfade: 0.8 })
  })

  it('treats corrupt storage as absent', () => {
    localStorage.setItem('magenta-dj:v1', '{nope')
    expect(loadDeckSettings('a')).toEqual({})
    expect(loadAppSettings()).toEqual({})
  })

  it('drops malformed fields but keeps valid ones', () => {
    localStorage.setItem(
      'magenta-dj:v1',
      JSON.stringify({
        decks: {
          a: {
            targets: [{ text: 42, x: 'left', y: 0 }],
            cursor: { x: 0.5, y: 0.5 },
            volume: 'loud',
          },
        },
        app: { crossfade: 'middle' },
      }),
    )
    expect(loadDeckSettings('a')).toEqual({ cursor: { x: 0.5, y: 0.5 } })
    expect(loadAppSettings()).toEqual({})
  })
})
