import type { DeckId } from '../audio/engine'
import { FX_KINDS } from '../audio/fx'
import { isDeckOperable } from '../deck/deckState'
import type { DeckControls } from '../deck/useDeck'
import type { ControlIntent } from './bus'

export type AppIntentHandlers = {
  onCrossfade: (position: number) => void
  onCueMix: (position: number) => void
}

/** The App-owned slice of the intent union: transport, deck prep, channel
 * volume/EQ/cue, the crossfader, and the cue mix. Style and record intents
 * are handled where that state lives (DeckColumn, MixerStrip). Pure
 * dispatch so the mapping is testable without rendering the app. */
export function applyAppIntent(
  intent: ControlIntent,
  decks: Record<DeckId, DeckControls>,
  handlers: AppIntentHandlers,
): void {
  switch (intent.kind) {
    case 'play_toggle': {
      const deck = decks[intent.deck]
      // A playback deck answers to its track, not the worker — the
      // worker is parked and state.playing is honestly false (M19).
      if (deck.mode === 'playback') {
        if (deck.track?.playing) deck.stop()
        else void deck.play()
        return
      }
      // Same gating as the transport button: hardware must not start a
      // deck the UI would refuse to.
      if (!isDeckOperable(deck.state)) return
      if (deck.state.playing) deck.stop()
      else void deck.play()
      return
    }
    case 'deck_prep': {
      const deck = decks[intent.deck]
      // CUE on a track returns it to the top, parked (prime carries
      // the playback-mode semantics, ADR-0013).
      if (deck.mode === 'playback') {
        void deck.prime()
        return
      }
      if (!isDeckOperable(deck.state)) return
      // CUE on a rolling deck (primed or on air) stops with flush; on a
      // stopped deck it primes — generation audible only over the cue tap.
      if (deck.state.playing) deck.stop()
      else void deck.prime()
      return
    }
    case 'volume':
      decks[intent.deck].setVolume(intent.value)
      return
    case 'eq':
      decks[intent.deck].setEqBand(intent.band, intent.value)
      return
    case 'cue_toggle': {
      const deck = decks[intent.deck]
      deck.setCue(!deck.cue)
      return
    }
    case 'fx_amount':
      decks[intent.deck].setFxAmount(intent.value)
      return
    case 'fx_select': {
      // PAD FX bank: pads 1–6 are the six effects; pressing the active
      // effect's pad toggles it off, like a hardware FX section.
      const kind = FX_KINDS[intent.index]
      if (!kind) return
      const deck = decks[intent.deck]
      deck.setFx(deck.fx.kind === kind ? null : kind)
      return
    }
    case 'loop_pad':
      // SAMPLER bank (M13): empty captures-and-freezes, filled swaps
      // in, active returns to live — the semantics live in useDeck so
      // the on-screen pads behave identically.
      decks[intent.deck].toggleLoopPad(intent.index)
      return
    case 'loop_clear':
      decks[intent.deck].clearLoopPad(intent.index)
      return
    case 'crossfade':
      handlers.onCrossfade(intent.value)
      return
    case 'cue_mix':
      handlers.onCueMix(intent.value)
      return
  }
}
