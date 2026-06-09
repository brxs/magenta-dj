/** Pure deck state: every WebSocket and worklet event funnels through this
 * reducer, so the UI is a function of one state object and the stream's
 * health (buffer level, underruns) is always visible, never inferred. */

export type ServerEvent =
  | {
      event: 'hello'
      deck: string
      model: string
      sample_rate: number
      channels: number
      chunk_seconds: number
    }
  | { event: 'ready'; deck: string; model: string }
  | { event: 'chunk'; index: number; rtf: number | null; prompt: string | null }
  | { event: 'prompt_applied'; prompt: string; effective_from_chunk: number }
  | { event: 'error'; error: string }

export type WorkletStats = {
  underruns: number
  bufferedSeconds: number
  playing: boolean
}

export type DeckAction =
  | { type: 'socket_connecting' }
  | { type: 'socket_open' }
  | { type: 'socket_closed' }
  | { type: 'server_event'; event: ServerEvent }
  | { type: 'worklet_stats'; stats: WorkletStats }
  | { type: 'play_requested' }
  | { type: 'stop_requested' }

export type DeckState = {
  connection: 'connecting' | 'open' | 'closed'
  model: string | null
  chunkSeconds: number
  /** The user pressed play and the worker is expected to stream. */
  playing: boolean
  /** The worklet is actually emitting sound (false while prebuffering). */
  audible: boolean
  activePrompt: string | null
  bufferedSeconds: number
  underruns: number
  generationSpeed: number | null
  error: string | null
}

export const initialDeckState: DeckState = {
  connection: 'connecting',
  model: null,
  chunkSeconds: 1,
  playing: false,
  audible: false,
  activePrompt: null,
  bufferedSeconds: 0,
  underruns: 0,
  generationSpeed: null,
  error: null,
}

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case 'socket_connecting':
      return { ...state, connection: 'connecting' }
    case 'socket_open':
      return { ...state, connection: 'open', error: null }
    case 'socket_closed':
      return { ...state, connection: 'closed', playing: false, audible: false }
    case 'play_requested':
      return { ...state, playing: true }
    case 'stop_requested':
      return { ...state, playing: false }
    case 'worklet_stats':
      return {
        ...state,
        bufferedSeconds: action.stats.bufferedSeconds,
        underruns: action.stats.underruns,
        audible: action.stats.playing,
      }
    case 'server_event':
      return applyServerEvent(state, action.event)
  }
}

function applyServerEvent(state: DeckState, event: ServerEvent): DeckState {
  switch (event.event) {
    case 'hello':
      return { ...state, model: event.model, chunkSeconds: event.chunk_seconds }
    case 'ready':
      return { ...state, model: event.model }
    case 'chunk':
      return { ...state, generationSpeed: event.rtf }
    case 'prompt_applied':
      return { ...state, activePrompt: event.prompt, error: null }
    case 'error':
      return { ...state, error: event.error }
    default:
      return state
  }
}
