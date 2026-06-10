/** Shared audio graph (ADR-0003): one AudioContext for the whole app.
 *
 *   deck worklet → EQ → deck volume gain → crossfade gain ─┐
 *   deck worklet → EQ → deck volume gain → crossfade gain ─┴→ master → speakers
 *                   └→ cue toggle ─┐
 *                   └→ cue toggle ─┴→ cue bus ─┐ (blend) → cue out → phones
 *                                     master ──┘
 *
 * The crossfader lives here, not in a deck: it blends the two decks with
 * equal-power gains so the perceived loudness stays constant across the
 * sweep. The cue path (ADR-0006) taps each deck post-EQ, pre-fader, blends
 * with the master per the cue-mix position, and leaves through a SECOND
 * sink — an audio element pinned to the chosen headphone device — because
 * Chromium caps a context's output at stereo. Everything is created lazily
 * on the first play() (browser autoplay policy requires a user gesture).
 */

import { EQ_BANDS, EQ_FILTERS, eqValueToDb, type EqBand } from './eq'
import { rangeFromBytes, rmsFromBytes } from './levels'
import { encodeWav, floatToInt16 } from './wav'

export type DeckId = 'a' | 'b'

export type DeckChannel = {
  postPcm: (samples: Float32Array) => void
  reset: () => void
  setVolume: (volume: number) => void
  setEq: (band: EqBand, value: number) => void
  /** Feed this channel (post-EQ, pre-fader) into the headphone cue bus. */
  setCue: (on: boolean) => void
  /** Off-air mutes the channel's master feed only — generation, meters,
   * and the cue tap stay live. The primed-deck state (M10). */
  setOnAir: (on: boolean) => void
  /** Post-fader RMS level, 0..~1 (for channel meters). */
  getLevel: () => number
  /** Min/max of the latest audio window, -1..1 (for waveform strips). */
  getWaveformRange: () => [number, number]
  dispose: () => void
}

export type StatsHandler = (stats: {
  underruns: number
  bufferedSeconds: number
  playing: boolean
}) => void

export type AudioEngine = {
  createDeckChannel: (
    deckId: DeckId,
    initial: { volume: number; eq: Record<EqBand, number>; cue: boolean },
    onStats: StatsHandler,
  ) => Promise<DeckChannel>
  resume: () => Promise<void>
  setCrossfade: (position: number) => void
  /** Cue/master blend for the headphone feed: 0 = cue only, 1 = master. */
  setCueMix: (position: number) => void
  /** Route the cue feed to an output device; null switches it off. */
  setCueDevice: (deviceId: string | null) => Promise<void>
  /** Master-bus RMS level, 0..~1 (what the speakers get). */
  getMasterLevel: () => number
  /** Start capturing the master bus (exactly the speaker feed). */
  startRecording: () => Promise<void>
  /** Stop capturing and return the session as a WAV blob. */
  stopRecording: () => Promise<Blob>
}

const SAMPLE_RATE = 48_000
const PARAM_RAMP_SECONDS = 0.02
const FLUSH_TIMEOUT_MS = 2_000

/** Centre position; the single source for App state and the bus default. */
export const INITIAL_CROSSFADE = 0.5

/** Even cue/master blend in the phones; same role as INITIAL_CROSSFADE. */
export const INITIAL_CUE_MIX = 0.5

/** Equal-power crossfade gains for a position in [0, 1] (0 = full A). */
export function equalPowerGains(position: number): { a: number; b: number } {
  const clamped = Math.min(1, Math.max(0, position))
  return {
    a: Math.cos((clamped * Math.PI) / 2),
    b: Math.sin((clamped * Math.PI) / 2),
  }
}

type Bus = {
  context: AudioContext
  master: GainNode
  masterAnalyser: AnalyserNode
  crossfade: Record<DeckId, GainNode>
  cueBus: GainNode
  cueLevel: GainNode
  cueMonitor: GainNode
  cueOut: MediaStreamAudioDestinationNode
}

const ANALYSER_FFT_SIZE = 2048

function rmsLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer)
  return rmsFromBytes(buffer)
}

type Recorder = {
  node: AudioWorkletNode
  chunks: Int16Array<ArrayBuffer>[]
}

export function createAudioEngine(): AudioEngine {
  let busPromise: Promise<Bus> | null = null
  let crossfadePosition = INITIAL_CROSSFADE
  let cueMixPosition = INITIAL_CUE_MIX
  // The cue feed's second sink (ADR-0006): an audio element carrying the
  // cue-out stream to the chosen headphone device.
  let cueElement: HTMLAudioElement | null = null
  let cueDeviceId: string | null = null
  let recorder: Recorder | null = null
  // Mirrors bus.masterAnalyser: getMasterLevel must be synchronous (meters
  // poll it every frame) while the bus itself sits behind a promise.
  let masterAnalyserRef: AnalyserNode | null = null
  let masterBuffer: Uint8Array<ArrayBuffer> | null = null

  async function buildBus(): Promise<Bus> {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE })
    try {
      await context.audioWorklet.addModule('/player-worklet.js')
      const master = context.createGain()
      master.connect(context.destination)
      const masterAnalyser = context.createAnalyser()
      masterAnalyser.fftSize = ANALYSER_FFT_SIZE
      master.connect(masterAnalyser)
      masterAnalyserRef = masterAnalyser
      masterBuffer = new Uint8Array(masterAnalyser.fftSize)
      const gains = equalPowerGains(crossfadePosition)
      const crossfade = { a: context.createGain(), b: context.createGain() }
      crossfade.a.gain.value = gains.a
      crossfade.b.gain.value = gains.b
      crossfade.a.connect(master)
      crossfade.b.connect(master)
      // Headphone feed (ADR-0006): cue taps sum into cueBus; the blend
      // pair reuses the equal-power law (a = cue, b = master).
      const cueGains = equalPowerGains(cueMixPosition)
      const cueBus = context.createGain()
      const cueLevel = context.createGain()
      cueLevel.gain.value = cueGains.a
      const cueMonitor = context.createGain()
      cueMonitor.gain.value = cueGains.b
      const cueOut = context.createMediaStreamDestination()
      cueBus.connect(cueLevel)
      cueLevel.connect(cueOut)
      master.connect(cueMonitor)
      cueMonitor.connect(cueOut)
      return {
        context,
        master,
        masterAnalyser,
        crossfade,
        cueBus,
        cueLevel,
        cueMonitor,
        cueOut,
      }
    } catch (error) {
      void context.close()
      throw error
    }
  }

  function ensureBus(): Promise<Bus> {
    if (!busPromise) {
      busPromise = buildBus().catch((error: unknown) => {
        busPromise = null // allow a retry after failure
        throw error
      })
    }
    return busPromise
  }

  return {
    async createDeckChannel(deckId, initial, onStats) {
      const bus = await ensureBus()
      const worklet = new AudioWorkletNode(bus.context, 'pcm-player', {
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      // worklet → low → mid → high → volume → on-air → crossfade (M6/M10),
      // with the cue tap branching off post-EQ, pre-fader (M9).
      const eqNodes = Object.fromEntries(
        EQ_BANDS.map((band) => {
          const layout = EQ_FILTERS[band]
          const filter = bus.context.createBiquadFilter()
          filter.type = layout.type
          filter.frequency.value = layout.frequency
          if (layout.q !== undefined) filter.Q.value = layout.q
          filter.gain.value = eqValueToDb(initial.eq[band])
          return [band, filter]
        }),
      ) as Record<EqBand, BiquadFilterNode>
      let head: AudioNode = worklet
      for (const band of EQ_BANDS) {
        head.connect(eqNodes[band])
        head = eqNodes[band]
      }
      const cueToggle = bus.context.createGain()
      cueToggle.gain.value = initial.cue ? 1 : 0
      head.connect(cueToggle)
      cueToggle.connect(bus.cueBus)
      const volume = bus.context.createGain()
      volume.gain.value = initial.volume
      head.connect(volume)
      const onAir = bus.context.createGain()
      volume.connect(onAir)
      onAir.connect(bus.crossfade[deckId])
      // Post-fader tap for the channel meter and waveform strip.
      const analyser = bus.context.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      volume.connect(analyser)
      const analyserBuffer = new Uint8Array(analyser.fftSize)
      worklet.port.onmessage = (event) => onStats(event.data)
      return {
        postPcm(samples) {
          worklet.port.postMessage({ type: 'pcm', samples }, [samples.buffer])
        },
        reset() {
          worklet.port.postMessage({ type: 'reset' })
        },
        setVolume(next) {
          volume.gain.setTargetAtTime(
            next,
            bus.context.currentTime,
            PARAM_RAMP_SECONDS,
          )
        },
        setEq(band, value) {
          eqNodes[band].gain.setTargetAtTime(
            eqValueToDb(value),
            bus.context.currentTime,
            PARAM_RAMP_SECONDS,
          )
        },
        setCue(on) {
          cueToggle.gain.setTargetAtTime(
            on ? 1 : 0,
            bus.context.currentTime,
            PARAM_RAMP_SECONDS,
          )
        },
        setOnAir(on) {
          onAir.gain.setTargetAtTime(
            on ? 1 : 0,
            bus.context.currentTime,
            PARAM_RAMP_SECONDS,
          )
        },
        getLevel() {
          return rmsLevel(analyser, analyserBuffer)
        },
        getWaveformRange() {
          analyser.getByteTimeDomainData(analyserBuffer)
          return rangeFromBytes(analyserBuffer)
        },
        dispose() {
          worklet.port.onmessage = null
          worklet.disconnect()
          for (const band of EQ_BANDS) eqNodes[band].disconnect()
          cueToggle.disconnect()
          volume.disconnect()
          onAir.disconnect()
          analyser.disconnect()
        },
      }
    },

    async resume() {
      const bus = await ensureBus()
      await bus.context.resume()
      // A cue device restored on page load couldn't start its element
      // without a gesture; every resume() runs inside one, so retry here.
      if (cueElement && cueDeviceId && cueElement.paused) {
        void cueElement.play().catch(() => {})
      }
    },

    async startRecording() {
      if (recorder) return
      const bus = await ensureBus()
      if (recorder) return // a concurrent call won the await race
      const node = new AudioWorkletNode(bus.context, 'pcm-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      })
      const chunks: Int16Array<ArrayBuffer>[] = []
      node.port.onmessage = (event) => {
        if (event.data.type === 'pcm') {
          chunks.push(floatToInt16(event.data.samples as Float32Array))
        }
      }
      bus.master.connect(node)
      node.port.postMessage({ type: 'start' })
      recorder = { node, chunks }
    },

    async stopRecording() {
      if (!recorder) throw new Error('no recording in progress')
      const bus = await ensureBus()
      const { node, chunks } = recorder
      recorder = null
      try {
        // Worklet messages are serviced by the rendering thread; a
        // suspended context (audio interruption) would otherwise leave the
        // stop unacknowledged forever.
        await bus.context.resume()
        // The worklet flushes its partial batch before acknowledging the
        // stop, so the file ends exactly where the user stopped.
        await new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(
            () => reject(new Error('recorder did not flush in time')),
            FLUSH_TIMEOUT_MS,
          )
          node.port.onmessage = (event) => {
            if (event.data.type === 'pcm') {
              chunks.push(floatToInt16(event.data.samples as Float32Array))
            } else if (event.data.type === 'done') {
              clearTimeout(deadline)
              resolve()
            }
          }
          node.port.postMessage({ type: 'stop' })
        })
      } finally {
        bus.master.disconnect(node)
      }
      return encodeWav(chunks, SAMPLE_RATE, 2)
    },

    getMasterLevel() {
      if (!masterBuffer || !masterAnalyserRef) return 0
      return rmsLevel(masterAnalyserRef, masterBuffer)
    },

    setCueMix(position) {
      cueMixPosition = position
      void busPromise
        ?.then((bus) => {
          const gains = equalPowerGains(position)
          const now = bus.context.currentTime
          bus.cueLevel.gain.setTargetAtTime(gains.a, now, PARAM_RAMP_SECONDS)
          bus.cueMonitor.gain.setTargetAtTime(gains.b, now, PARAM_RAMP_SECONDS)
        })
        .catch(() => {})
    },

    async setCueDevice(deviceId) {
      cueDeviceId = deviceId
      if (!deviceId) {
        cueElement?.pause()
        return
      }
      const bus = await ensureBus()
      if (!cueElement) {
        cueElement = new Audio()
        cueElement.srcObject = bus.cueOut.stream
      }
      await cueElement.setSinkId(deviceId)
      // Autoplay may block this outside a gesture (e.g. restoring the
      // persisted device on load); resume() retries inside one.
      void cueElement.play().catch(() => {})
    },

    setCrossfade(position) {
      crossfadePosition = position
      // Applies live when the bus exists; otherwise buildBus picks the
      // stored position up at creation. A failed bus build already surfaces
      // through play(); the fader move itself has nothing to report.
      void busPromise
        ?.then((bus) => {
          const gains = equalPowerGains(position)
          const now = bus.context.currentTime
          bus.crossfade.a.gain.setTargetAtTime(gains.a, now, PARAM_RAMP_SECONDS)
          bus.crossfade.b.gain.setTargetAtTime(gains.b, now, PARAM_RAMP_SECONDS)
        })
        .catch(() => {})
    },
  }
}
