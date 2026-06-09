import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  deckReducer,
  initialDeckState,
  type DeckState,
  type ServerEvent,
  type WorkletStats,
} from './deckState'

const SAMPLE_RATE = 48_000
const RECONNECT_DELAY_MS = 2_000
const VOLUME_RAMP_SECONDS = 0.02

export type DeckControls = {
  state: DeckState
  volume: number
  play: () => Promise<void>
  stop: () => void
  setPrompt: (prompt: string) => void
  setVolume: (volume: number) => void
}

/** Owns one deck's WebSocket and audio graph:
 * socket → worklet ring buffer → per-deck gain → speakers. */
export function useDeck(deckId: string): DeckControls {
  const [state, dispatch] = useReducer(deckReducer, initialDeckState)
  const [volume, setVolumeState] = useState(0.8)
  const volumeRef = useRef(volume)

  type AudioGraph = {
    context: AudioContext
    worklet: AudioWorkletNode
    gain: GainNode
  }
  const socketRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<AudioGraph | null>(null)
  // Memoised in-flight build so rapid play() clicks share one graph instead
  // of leaking contexts (Chrome caps concurrent AudioContexts).
  const audioPromiseRef = useRef<Promise<AudioGraph> | null>(null)

  const buildAudioGraph = useCallback(async (): Promise<AudioGraph> => {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE })
    try {
      await context.audioWorklet.addModule('/player-worklet.js')
      const worklet = new AudioWorkletNode(context, 'pcm-player', {
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      const gain = context.createGain()
      gain.gain.value = volumeRef.current
      worklet.connect(gain)
      gain.connect(context.destination)
      worklet.port.onmessage = (event: MessageEvent<WorkletStats>) => {
        dispatch({ type: 'worklet_stats', stats: event.data })
      }
      const graph = { context, worklet, gain }
      audioRef.current = graph
      return graph
    } catch (error) {
      void context.close()
      throw error
    }
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioPromiseRef.current) {
      audioPromiseRef.current = buildAudioGraph().catch((error: unknown) => {
        audioPromiseRef.current = null // allow a retry after failure
        throw error
      })
    }
    return audioPromiseRef.current
  }, [buildAudioGraph])

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
          const samples = new Float32Array(event.data)
          audioRef.current?.worklet.port.postMessage({ type: 'pcm', samples }, [
            samples.buffer,
          ])
        } else {
          let parsed: ServerEvent
          try {
            parsed = JSON.parse(event.data) as ServerEvent
          } catch {
            console.warn(`deck ${deckId}: dropping malformed frame`, event.data)
            return
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
      audioRef.current?.context.close()
      audioRef.current = null
      audioPromiseRef.current = null
    }
  }, [deckId])

  const send = useCallback((command: object) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(command))
    }
  }, [])

  const play = useCallback(async () => {
    try {
      const audio = await ensureAudio()
      await audio.context.resume()
      // Drop whatever an earlier session left in the ring buffer, so the
      // first thing heard is the new stream, not stale chunks.
      audio.worklet.port.postMessage({ type: 'reset' })
    } catch (error) {
      dispatch({
        type: 'local_error',
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    send({ type: 'play' })
    dispatch({ type: 'play_requested' })
  }, [ensureAudio, send])

  const stop = useCallback(() => {
    send({ type: 'stop' })
    // Flush instead of letting the buffered seconds play out, so stop is
    // immediate like a DJ expects.
    audioRef.current?.worklet.port.postMessage({ type: 'reset' })
    dispatch({ type: 'stop_requested' })
  }, [send])

  const setPrompt = useCallback(
    (prompt: string) => {
      send({ type: 'set_prompt', prompt })
    },
    [send],
  )

  const setVolume = useCallback((next: number) => {
    setVolumeState(next)
    volumeRef.current = next
    const audio = audioRef.current
    if (audio) {
      audio.gain.gain.setTargetAtTime(
        next,
        audio.context.currentTime,
        VOLUME_RAMP_SECONDS,
      )
    }
  }, [])

  return { state, volume, play, stop, setPrompt, setVolume }
}
