import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { EQ_FLAT, type EqBand } from '../audio/eq'
import { fxRestPosition, type FxKind } from '../audio/fx'
import { useAudioEngine } from '../audio/engineContext'
import { loadDeckSettings, updateDeckSettings } from '../persistence'
import type { DeckChannel, DeckId } from '../audio/engine'
import {
  deckReducer,
  initialDeckState,
  type ActiveStyle,
  type DeckState,
  type ServerEvent,
} from './deckState'

const RECONNECT_DELAY_MS = 2_000

export type DeckControls = {
  state: DeckState
  volume: number
  eq: Record<EqBand, number>
  /** Headphone cue (PFL) on this channel. Deliberately not persisted:
   * a reload never blasts the phones unexpectedly. */
  cue: boolean
  setCue: (on: boolean) => void
  /** Color FX insert (M12): the selected effect and its knob position. */
  fx: { kind: FxKind | null; amount: number }
  /** Selecting an effect parks the knob at its rest position, so a
   * switch never lands mid-effect. */
  setFx: (kind: FxKind | null) => void
  setFxAmount: (amount: number) => void
  /** Generating but off air (M10): buffer fills, only the cue tap hears
   * it. play() then drops it on air without flushing what was built up. */
  primed: boolean
  prime: () => Promise<void>
  play: () => Promise<void>
  stop: () => void
  setStyle: (style: ActiveStyle) => void
  setModel: (model: string) => void
  restartWorker: () => void
  setVolume: (volume: number) => void
  setEqBand: (band: EqBand, value: number) => void
  getChannelLevel: () => number
  getChannelWaveformRange: () => [number, number]
}

/** Owns one deck's WebSocket and its channel on the shared audio engine
 * (worklet ring buffer → deck gain → crossfade bus, see audio/engine.ts). */
export function useDeck(deckId: DeckId): DeckControls {
  const engine = useAudioEngine()
  const [state, dispatch] = useReducer(deckReducer, initialDeckState)
  const [volume, setVolumeState] = useState(() => loadDeckSettings(deckId).volume ?? 0.8)
  const volumeRef = useRef(volume)
  const [eq, setEqState] = useState<Record<EqBand, number>>(
    () =>
      loadDeckSettings(deckId).eq ?? { low: EQ_FLAT, mid: EQ_FLAT, high: EQ_FLAT },
  )
  const eqRef = useRef(eq)
  const [cue, setCueState] = useState(false)
  const cueRef = useRef(cue)
  const [fx, setFxState] = useState<{ kind: FxKind | null; amount: number }>(
    () => loadDeckSettings(deckId).fx ?? { kind: null, amount: 0 },
  )
  const fxRef = useRef(fx)
  const [primed, setPrimedState] = useState(false)
  const primedRef = useRef(primed)

  const setPrimed = useCallback((next: boolean) => {
    setPrimedState(next)
    primedRef.current = next
  }, [])

  const socketRef = useRef<WebSocket | null>(null)
  const channelRef = useRef<DeckChannel | null>(null)
  // Memoised in-flight channel build so rapid play() clicks share one
  // channel instead of stacking worklets on the bus.
  const channelPromiseRef = useRef<Promise<DeckChannel> | null>(null)

  const ensureChannel = useCallback(() => {
    if (!channelPromiseRef.current) {
      channelPromiseRef.current = engine
        .createDeckChannel(
          deckId,
          {
            volume: volumeRef.current,
            eq: eqRef.current,
            cue: cueRef.current,
            fx: fxRef.current,
          },
          (stats) => dispatch({ type: 'worklet_stats', stats }),
        )
        .then((channel) => {
          channelRef.current = channel
          return channel
        })
        .catch((error: unknown) => {
          channelPromiseRef.current = null // allow a retry after failure
          throw error
        })
    }
    return channelPromiseRef.current
  }, [engine, deckId])

  useEffect(() => {
    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    function connect() {
      if (disposed) return
      dispatch({ type: 'socket_connecting' })
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${scheme}://${location.host}/ws/deck/${deckId}`)
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket

      socket.onopen = () => dispatch({ type: 'socket_open' })
      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          channelRef.current?.postPcm(new Float32Array(event.data))
        } else {
          let parsed: ServerEvent
          try {
            parsed = JSON.parse(event.data) as ServerEvent
          } catch {
            console.warn(`deck ${deckId}: dropping malformed frame`, event.data)
            return
          }
          if (parsed.event === 'model_loading' || parsed.event === 'worker_died') {
            // The stream this buffer came from is gone with the old worker;
            // a crashed deck goes silent rather than draining its tail under
            // the crash banner.
            channelRef.current?.reset()
          }
          dispatch({ type: 'server_event', event: parsed })
        }
      }
      socket.onclose = () => {
        if (disposed) return
        dispatch({ type: 'socket_closed' })
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      socketRef.current?.close()
      channelRef.current?.dispose()
      channelRef.current = null
      channelPromiseRef.current = null
    }
  }, [deckId])

  const send = useCallback((command: object) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(command))
    }
  }, [])

  const play = useCallback(async () => {
    // Dropping a primed deck on air: the worker already streams and the
    // buffer holds the prepped audio — unmute, don't flush or replay.
    if (primedRef.current) {
      channelRef.current?.setOnAir(true)
      setPrimed(false)
      return
    }
    try {
      const channel = await ensureChannel()
      await engine.resume()
      // Drop whatever an earlier session left in the ring buffer, so the
      // first thing heard is the new stream, not stale chunks.
      channel.reset()
      channel.setOnAir(true)
    } catch (error) {
      dispatch({
        type: 'local_error',
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    send({ type: 'play' })
    dispatch({ type: 'play_requested' })
  }, [ensureChannel, engine, send, setPrimed])

  /** Start generating off air: like play(), but muted on the master so
   * the prep is only audible over the cue tap (M10 transport CUE). */
  const prime = useCallback(async () => {
    if (primedRef.current) return
    try {
      const channel = await ensureChannel()
      await engine.resume()
      channel.reset()
      channel.setOnAir(false)
    } catch (error) {
      dispatch({
        type: 'local_error',
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    setPrimed(true)
    send({ type: 'play' })
    dispatch({ type: 'play_requested' })
  }, [ensureChannel, engine, send, setPrimed])

  const stop = useCallback(() => {
    send({ type: 'stop' })
    // Flush instead of letting the buffered seconds play out, so stop is
    // immediate like a DJ expects. The empty channel goes back on air so
    // the next plain play() isn't silent.
    channelRef.current?.reset()
    channelRef.current?.setOnAir(true)
    setPrimed(false)
    dispatch({ type: 'stop_requested' })
  }, [send, setPrimed])

  const setStyle = useCallback(
    (style: ActiveStyle) => {
      send({ type: 'set_style', prompts: style.prompts })
    },
    [send],
  )

  const setModel = useCallback(
    (model: string) => {
      send({ type: 'set_model', model })
    },
    [send],
  )

  const restartWorker = useCallback(() => {
    send({ type: 'restart' })
  }, [send])

  const setVolume = useCallback(
    (next: number) => {
      setVolumeState(next)
      volumeRef.current = next
      channelRef.current?.setVolume(next)
      updateDeckSettings(deckId, { volume: next })
    },
    [deckId],
  )

  const getChannelLevel = useCallback(
    () => channelRef.current?.getLevel() ?? 0,
    [],
  )

  const getChannelWaveformRange = useCallback(
    (): [number, number] => channelRef.current?.getWaveformRange() ?? [0, 0],
    [],
  )

  const setCue = useCallback((on: boolean) => {
    setCueState(on)
    cueRef.current = on
    channelRef.current?.setCue(on)
  }, [])

  const setFx = useCallback(
    (kind: FxKind | null) => {
      const next = { kind, amount: kind ? fxRestPosition(kind) : 0 }
      setFxState(next)
      fxRef.current = next
      updateDeckSettings(deckId, { fx: next })
      channelRef.current?.setFx(kind)
      channelRef.current?.setFxAmount(next.amount)
    },
    [deckId],
  )

  const setFxAmount = useCallback(
    (amount: number) => {
      const next = { ...fxRef.current, amount }
      setFxState(next)
      fxRef.current = next
      updateDeckSettings(deckId, { fx: next })
      channelRef.current?.setFxAmount(amount)
    },
    [deckId],
  )

  const setEqBand = useCallback(
    (band: EqBand, value: number) => {
      const next = { ...eqRef.current, [band]: value }
      eqRef.current = next
      setEqState(next)
      updateDeckSettings(deckId, { eq: next })
      channelRef.current?.setEq(band, value)
    },
    [deckId],
  )

  return {
    state,
    volume,
    eq,
    cue,
    setCue,
    fx,
    setFx,
    setFxAmount,
    primed,
    prime,
    play,
    stop,
    setStyle,
    setModel,
    restartWorker,
    setVolume,
    setEqBand,
    getChannelLevel,
    getChannelWaveformRange,
  }
}
