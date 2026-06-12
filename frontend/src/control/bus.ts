/** ControlBus (ADR-0005): typed control intents as a small pub/sub, so
 * control sources (MIDI now, anything later) are decoupled from the React
 * components that own the state. Keyboard/mouse paths don't go through it. */

import type { EqBand } from '../audio/eq'
import type { DeckId } from '../audio/engine'
import type { StylePreset } from '../presets'

export type ControlIntent =
  | { kind: 'play_toggle'; deck: DeckId }
  | { kind: 'volume'; deck: DeckId; value: number }
  | { kind: 'eq'; deck: DeckId; band: EqBand; value: number }
  | { kind: 'crossfade'; value: number }
  | { kind: 'style_target'; deck: DeckId; index: number }
  | { kind: 'style_sweep'; deck: DeckId; value: number }
  | { kind: 'record_toggle' }
  | { kind: 'cue_toggle'; deck: DeckId }
  | { kind: 'cue_mix'; value: number }
  | { kind: 'deck_prep'; deck: DeckId }
  | { kind: 'fx_amount'; deck: DeckId; value: number }
  | { kind: 'fx_select'; deck: DeckId; index: number }
  | { kind: 'loop_pad'; deck: DeckId; index: number }
  | { kind: 'loop_clear'; deck: DeckId; index: number }
  // Media browsing (M16 crates, widened by M19): the rotary moves the
  // visible explorer tab's highlight and LOAD loads the highlighted
  // item — crate or track, the item type decides what loading means
  // (ADR-0013). A chosen preset's pad portion rides the bus to the
  // owning deck column.
  | { kind: 'browse_scroll'; steps: number }
  | { kind: 'browse_load'; deck: DeckId }
  // Rotary press (M19): cycle the explorer's visible tab.
  | { kind: 'browse_tab' }
  // Jog wheel ticks (M19): relative seek on a playback deck; a
  // realtime deck ignores them (ADR-0004 — no scratch concept).
  | { kind: 'track_seek'; deck: DeckId; steps: number }
  | { kind: 'preset_load'; deck: DeckId; preset: StylePreset }

export type ControlBus = {
  publish: (intent: ControlIntent) => void
  /** Returns the unsubscribe function. */
  subscribe: (handler: (intent: ControlIntent) => void) => () => void
}

export function createControlBus(): ControlBus {
  const handlers = new Set<(intent: ControlIntent) => void>()
  return {
    publish(intent) {
      for (const handler of handlers) handler(intent)
    },
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}
