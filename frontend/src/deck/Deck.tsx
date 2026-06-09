import { DeckPanel } from './DeckPanel'
import { useDeck } from './useDeck'

export function Deck({ id }: { id: string }) {
  const { state, volume, play, stop, setPrompt, setVolume } = useDeck(id)
  return (
    <DeckPanel
      deckId={id}
      state={state}
      volume={volume}
      onPlay={() => void play()}
      onStop={stop}
      onSetPrompt={setPrompt}
      onSetVolume={setVolume}
    />
  )
}
