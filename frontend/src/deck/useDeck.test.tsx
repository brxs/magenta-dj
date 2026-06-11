/** useDeck behaviour with a fake WebSocket, fake timers, and a fake audio
 * engine: reconnect after a server-side close, command gating while the
 * socket is not open, play() failure surfacing, and ring-buffer hygiene on
 * model switches. The real audio graph stays on the e2e script. */

import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioEngineProvider } from '../audio/AudioEngineProvider'
import { updateDeckSettings } from '../persistence'
import type { AudioEngine, DeckChannel } from '../audio/engine'
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

  serverEvent(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
}

function makeFakeEngine(overrides: Partial<AudioEngine> = {}) {
  const channel: DeckChannel = {
    postPcm: vi.fn(),
    reset: vi.fn(),
    setVolume: vi.fn(),
    setEq: vi.fn(),
    setCue: vi.fn(),
    setFx: vi.fn(),
    setFxAmount: vi.fn(),
    setOnAir: vi.fn(),
    captureLoop: vi.fn(async () => true),
    playLoop: vi.fn(() => true),
    stopLoop: vi.fn(),
    clearLoop: vi.fn(),
    getLevel: vi.fn(() => 0),
    getWaveformRange: vi.fn(() => [0, 0] as [number, number]),
    dispose: vi.fn(),
  }
  const engine: AudioEngine = {
    createDeckChannel: vi.fn(async () => channel),
    resume: vi.fn(async () => {}),
    setCrossfade: vi.fn(),
    setCueMix: vi.fn(),
    setCueDevice: vi.fn(async () => {}),
    startCueCapture: vi.fn(async () => {}),
    stopCueCapture: vi.fn(),
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => new Blob()),
    getMasterLevel: vi.fn(() => 0),
    ...overrides,
  }
  return { engine, channel }
}

function renderDeck(engine: AudioEngine) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AudioEngineProvider engine={engine}>{children}</AudioEngineProvider>
  )
  return renderHook(() => useDeck('a'), { wrapper })
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
    const { result } = renderDeck(makeFakeEngine().engine)
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
    const { result } = renderDeck(makeFakeEngine().engine)

    const style = { prompts: [{ text: 'warm disco funk', weight: 1 }] }
    act(() => result.current.setStyle(style))
    expect(socket(0).sent).toHaveLength(0)

    act(() => socket(0).serverOpen())
    act(() => result.current.setStyle(style))
    expect(socket(0).sent).toEqual([
      JSON.stringify({
        type: 'set_style',
        prompts: [{ text: 'warm disco funk', weight: 1 }],
      }),
    ])
  })

  it('does not reconnect after unmount', () => {
    const { unmount } = renderDeck(makeFakeEngine().engine)
    act(() => socket(0).serverOpen())

    unmount()
    act(() => socket(0).serverClose())
    act(() => void vi.advanceTimersByTime(10_000))
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('surfaces a play() audio failure instead of swallowing it', async () => {
    const { engine } = makeFakeEngine({
      createDeckChannel: vi.fn(async () => {
        throw new Error('worklet failed to load')
      }),
    })
    const { result } = renderDeck(engine)
    act(() => socket(0).serverOpen())

    await act(() => result.current.play())
    expect(result.current.state.error).toBe('worklet failed to load')
    expect(result.current.state.playing).toBe(false)
    expect(socket(0).sent).toHaveLength(0) // no play command without audio
  })

  it('plays through the shared engine and resets stale buffer first', async () => {
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    act(() => socket(0).serverOpen())

    await act(() => result.current.play())
    expect(engine.resume).toHaveBeenCalled()
    expect(channel.reset).toHaveBeenCalled()
    expect(socket(0).sent).toEqual([JSON.stringify({ type: 'play' })])
    expect(result.current.state.playing).toBe(true)
  })

  it('flushes the ring buffer when a model switch starts', async () => {
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    act(() => socket(0).serverOpen())
    await act(() => result.current.play())
    const resetsBefore = vi.mocked(channel.reset).mock.calls.length

    act(() => socket(0).serverEvent({ event: 'model_loading', model: 'mrt2_base' }))
    expect(vi.mocked(channel.reset).mock.calls.length).toBe(resetsBefore + 1)
    expect(result.current.state.switchingModel).toBe(true)
    expect(result.current.state.playing).toBe(false)
  })

  it('silences the ring buffer when the worker dies', async () => {
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    act(() => socket(0).serverOpen())
    await act(() => result.current.play())
    const resetsBefore = vi.mocked(channel.reset).mock.calls.length

    act(() => socket(0).serverEvent({ event: 'worker_died', model: 'mrt2_small' }))
    expect(vi.mocked(channel.reset).mock.calls.length).toBe(resetsBefore + 1)
    expect(result.current.state.workerDied).toBe(true)
  })

  it('sends set_model and restart commands', () => {
    const { result } = renderDeck(makeFakeEngine().engine)
    act(() => socket(0).serverOpen())

    act(() => result.current.setModel('mrt2_base'))
    act(() => result.current.restartWorker())
    expect(socket(0).sent).toEqual([
      JSON.stringify({ type: 'set_model', model: 'mrt2_base' }),
      JSON.stringify({ type: 'restart' }),
    ])
  })

  it('restores persisted EQ and applies band changes to the channel', async () => {
    updateDeckSettings('a', { eq: { low: 0.2, mid: 0.5, high: 0.9 } })
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    expect(result.current.eq).toEqual({ low: 0.2, mid: 0.5, high: 0.9 })

    act(() => socket(0).serverOpen())
    await act(() => result.current.play())
    // The channel was built with the restored EQ…
    expect(vi.mocked(engine.createDeckChannel).mock.calls[0][1]).toMatchObject({
      eq: { low: 0.2, mid: 0.5, high: 0.9 },
    })
    // …and live band moves reach it.
    act(() => result.current.setEqBand('low', 0))
    expect(channel.setEq).toHaveBeenCalledWith('low', 0)
    expect(result.current.eq.low).toBe(0)
  })

  it('restores the persisted volume', () => {
    updateDeckSettings('a', { volume: 0.55 })
    const { result } = renderDeck(makeFakeEngine().engine)
    expect(result.current.volume).toBe(0.55)
  })

  it('primes off air and drops on air without flushing the prepped buffer', async () => {
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    act(() => socket(0).serverOpen())

    await act(() => result.current.prime())
    expect(channel.setOnAir).toHaveBeenLastCalledWith(false)
    expect(result.current.primed).toBe(true)
    expect(socket(0).sent).toEqual([JSON.stringify({ type: 'play' })])

    vi.mocked(channel.reset).mockClear()
    await act(() => result.current.play())
    expect(channel.setOnAir).toHaveBeenLastCalledWith(true)
    expect(result.current.primed).toBe(false)
    // The drop must not flush the prepped audio or re-send play.
    expect(channel.reset).not.toHaveBeenCalled()
    expect(socket(0).sent).toEqual([JSON.stringify({ type: 'play' })])
  })

  it('stop while primed flushes and puts the channel back on air', async () => {
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    act(() => socket(0).serverOpen())

    await act(() => result.current.prime())
    act(() => result.current.stop())
    expect(result.current.primed).toBe(false)
    expect(channel.reset).toHaveBeenCalled()
    expect(channel.setOnAir).toHaveBeenLastCalledWith(true)
  })

  it('restores persisted FX, routes changes, and parks the knob on switch', async () => {
    updateDeckSettings('a', { fx: { kind: 'dub_echo', amount: 0.6 } })
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)
    expect(result.current.fx).toEqual({ kind: 'dub_echo', amount: 0.6 })

    act(() => socket(0).serverOpen())
    await act(() => result.current.play())
    // The channel is built with the restored effect…
    expect(vi.mocked(engine.createDeckChannel).mock.calls[0][1]).toMatchObject({
      fx: { kind: 'dub_echo', amount: 0.6 },
    })

    // …live knob moves reach it…
    act(() => result.current.setFxAmount(0.8))
    expect(channel.setFxAmount).toHaveBeenCalledWith(0.8)

    // …and switching to the bipolar filter parks the knob at centre.
    act(() => result.current.setFx('filter'))
    expect(result.current.fx).toEqual({ kind: 'filter', amount: 0.5 })
    expect(channel.setFx).toHaveBeenCalledWith('filter')
    expect(channel.setFxAmount).toHaveBeenLastCalledWith(0.5)
  })

  it('seeds a pre-play cue toggle into the channel and routes live ones', async () => {
    const { engine, channel } = makeFakeEngine()
    const { result } = renderDeck(engine)

    // Toggled before the channel exists — must ride along at creation.
    act(() => result.current.setCue(true))
    expect(result.current.cue).toBe(true)

    act(() => socket(0).serverOpen())
    await act(() => result.current.play())
    expect(vi.mocked(engine.createDeckChannel).mock.calls[0][1]).toMatchObject({
      cue: true,
    })

    act(() => result.current.setCue(false))
    expect(channel.setCue).toHaveBeenCalledWith(false)
    expect(result.current.cue).toBe(false)
  })

  it('surfaces malformed frames as dropped, not crashes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderDeck(makeFakeEngine().engine)
    act(() => socket(0).serverOpen())

    act(() => socket(0).onmessage?.({ data: '{not json' }))
    expect(result.current.state.connection).toBe('open')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
