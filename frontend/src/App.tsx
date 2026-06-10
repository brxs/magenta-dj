import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { INITIAL_CROSSFADE } from './audio/engine'
import { useAudioEngine } from './audio/engineContext'
import { MidiControls } from './control/MidiControls'
import { DeckColumn } from './deck/DeckColumn'
import { useDeck } from './deck/useDeck'
import { MixerStrip, type ChannelControls } from './mixer/MixerStrip'
import { loadAppSettings, updateAppSettings } from './persistence'
import { combinedRamWarning } from './ramWarning'
import { handleShortcutKey } from './shortcuts'

function App() {
  const { t } = useTranslation()
  const engine = useAudioEngine()
  const deckA = useDeck('a')
  const deckB = useDeck('b')
  const [crossfade, setCrossfade] = useState(
    () => loadAppSettings().crossfade ?? INITIAL_CROSSFADE,
  )

  // Hand the restored crossfade to the engine once — it holds the position
  // until the bus is built on first play. Later moves go through
  // handleCrossfade, so this deliberately ignores `crossfade` updates.
  useEffect(() => {
    engine.setCrossfade(crossfade)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    window.addEventListener('keydown', handleShortcutKey)
    return () => window.removeEventListener('keydown', handleShortcutKey)
  }, [])

  const handleCrossfade = useCallback((position: number) => {
    setCrossfade(position)
    updateAppSettings({ crossfade: position })
  }, [])

  const ramWarning = combinedRamWarning(
    { a: deckA.state.model, b: deckB.state.model },
    deckA.state.ramInfo ?? deckB.state.ramInfo,
  )

  const channels: Record<'a' | 'b', ChannelControls> = {
    a: {
      volume: deckA.volume,
      eq: deckA.eq,
      onSetVolume: deckA.setVolume,
      onSetEqBand: deckA.setEqBand,
      getLevel: deckA.getChannelLevel,
    },
    b: {
      volume: deckB.volume,
      eq: deckB.eq,
      onSetVolume: deckB.setVolume,
      onSetEqBand: deckB.setEqBand,
      getLevel: deckB.getChannelLevel,
    },
  }

  return (
    <main className="app">
      <header className="app__statusbar">
        <h1 className="app__title">{t('app.title')}</h1>
        {ramWarning && (
          <p className="app__warning" role="status">
            {t('app.ramWarning', ramWarning)}
          </p>
        )}
        <p className="app__hint">{t('app.shortcutsHint')}</p>
        <MidiControls />
      </header>
      <div className="app__booth">
        <DeckColumn
          deckId="a"
          state={deckA.state}
          getWaveformRange={deckA.getChannelWaveformRange}
          onPlay={() => void deckA.play()}
          onStop={deckA.stop}
          onSetStyle={deckA.setStyle}
          onSetModel={deckA.setModel}
          onRestart={deckA.restartWorker}
        />
        <MixerStrip
          channels={channels}
          crossfade={crossfade}
          onCrossfadeChange={handleCrossfade}
        />
        <DeckColumn
          deckId="b"
          state={deckB.state}
          getWaveformRange={deckB.getChannelWaveformRange}
          onPlay={() => void deckB.play()}
          onStop={deckB.stop}
          onSetStyle={deckB.setStyle}
          onSetModel={deckB.setModel}
          onRestart={deckB.restartWorker}
        />
      </div>
    </main>
  )
}

export default App
