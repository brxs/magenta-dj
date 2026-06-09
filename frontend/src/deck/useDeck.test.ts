/** useDeck connection behaviour with a fake WebSocket and fake timers:
 * reconnect after a server-side close, command gating while the socket is
 * not open, and no reconnect after unmount. The audio graph stays on the
 * e2e script (scripts/verify_m2.mjs). */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDeck } from './useDeck'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  binaryType = ''
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    // The app closing its own socket on unmount; no onclose echo needed.
    this.readyState = FakeWebSocket.CLOSED
  }

  serverOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const socket = (index: number) => FakeWebSocket.instances[index]

describe('useDeck connection', () => {
  it('reconnects after the server closes the socket', () => {
    const { result } = renderHook(() => useDeck('a'))
    expect(FakeWebSocket.instances).toHaveLength(1)

    act(() => socket(0).serverOpen())
    expect(result.current.state.connection).toBe('open')

    act(() => socket(0).serverClose())
    expect(result.current.state.connection).toBe('closed')

    act(() => void vi.advanceTimersByTime(2_000))
    expect(FakeWebSocket.instances).toHaveLength(2)

    act(() => socket(1).serverOpen())
    expect(result.current.state.connection).toBe('open')
  })

  it('drops commands while the socket is not open', () => {
    const { result } = renderHook(() => useDeck('a'))

    act(() => result.current.setPrompt('too early'))
    expect(socket(0).sent).toHaveLength(0)

    act(() => socket(0).serverOpen())
    act(() => result.current.setPrompt('warm disco funk'))
    expect(socket(0).sent).toEqual([
      JSON.stringify({ type: 'set_prompt', prompt: 'warm disco funk' }),
    ])
  })

  it('does not reconnect after unmount', () => {
    const { unmount } = renderHook(() => useDeck('a'))
    act(() => socket(0).serverOpen())

    unmount()
    act(() => socket(0).serverClose())
    act(() => void vi.advanceTimersByTime(10_000))
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('surfaces a play() audio failure instead of swallowing it', async () => {
    // jsdom has no AudioContext, so building the audio graph rejects —
    // exactly the failure class (worklet 404, autoplay policy) play() must
    // report through the deck's error channel.
    const { result } = renderHook(() => useDeck('a'))
    act(() => socket(0).serverOpen())

    await act(() => result.current.play())
    expect(result.current.state.error).toBeTruthy()
    expect(result.current.state.playing).toBe(false)
    expect(socket(0).sent).toHaveLength(0) // no play command without audio
  })

  it('surfaces malformed frames as dropped, not crashes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useDeck('a'))
    act(() => socket(0).serverOpen())

    act(() => socket(0).onmessage?.({ data: '{not json' }))
    expect(result.current.state.connection).toBe('open')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
