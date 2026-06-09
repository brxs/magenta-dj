import { describe, expect, it } from 'vitest'

import {
  deckReducer,
  initialDeckState,
  type DeckAction,
  type DeckState,
} from './deckState'

function reduce(actions: DeckAction[], from: DeckState = initialDeckState) {
  return actions.reduce(deckReducer, from)
}

describe('deckReducer', () => {
  it('records buffer level, underruns, and audibility from worklet stats', () => {
    const state = reduce([
      {
        type: 'worklet_stats',
        stats: { underruns: 2, bufferedSeconds: 1.7, playing: true },
      },
    ])
    expect(state.underruns).toBe(2)
    expect(state.bufferedSeconds).toBeCloseTo(1.7)
    expect(state.audible).toBe(true)
  })

  it('adopts model and chunk size from the hello event', () => {
    const state = reduce([
      {
        type: 'server_event',
        event: {
          event: 'hello',
          deck: 'a',
          model: 'mrt2_small',
          sample_rate: 48_000,
          channels: 2,
          chunk_seconds: 1,
        },
      },
    ])
    expect(state.model).toBe('mrt2_small')
    expect(state.chunkSeconds).toBe(1)
  })

  it('tracks generation speed from chunk events', () => {
    const state = reduce([
      {
        type: 'server_event',
        event: { event: 'chunk', index: 4, rtf: 1.86, prompt: 'x' },
      },
    ])
    expect(state.generationSpeed).toBe(1.86)
  })

  it('surfaces worker errors and clears them when a prompt applies', () => {
    const errored = reduce([
      { type: 'server_event', event: { event: 'error', error: 'boom' } },
    ])
    expect(errored.error).toBe('boom')

    const recovered = reduce(
      [
        {
          type: 'server_event',
          event: { event: 'prompt_applied', prompt: 'funk', effective_from_chunk: 3 },
        },
      ],
      errored,
    )
    expect(recovered.error).toBeNull()
    expect(recovered.activePrompt).toBe('funk')
  })

  it('stops playing and marks the connection when the socket closes', () => {
    const state = reduce([
      { type: 'play_requested' },
      { type: 'socket_closed' },
    ])
    expect(state.playing).toBe(false)
    expect(state.connection).toBe('closed')
  })
})
