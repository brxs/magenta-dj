import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { INITIAL_CROSSFADE, type DeckId } from './audio/engine'
import { Deck } from './deck/Deck'
import type { RamInfo } from './deck/deckState'
import { Mixer } from './mixer/Mixer'
import { combinedRamWarning } from './ramWarning'
import { loadAppSettings, updateAppSettings } from './persistence'
import { useAudioEngine } from './audio/engineContext'

function App() {
  const { t } = useTranslation()
  const engine = useAudioEngine()
  const [crossfade, setCrossfade] = useState(
    () => loadAppSettings().crossfade ?? INITIAL_CROSSFADE,
  )

  // Apply the restored crossfade before the bus is built (the engine stores
  // it until first play), and register the focus shortcuts.
  useEffect(() => {
    engine.setCrossfade(crossfade)
    // Restore-once: later moves go through handleCrossfade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const origin = event.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(origin.tagName)) return
      const selector = {
        a: '[data-shortcut="deck-a-prompt"]',
        b: '[data-shortcut="deck-b-prompt"]',
        x: '[data-shortcut="crossfade"]',
      }[event.key]
      if (!selector) return
      event.preventDefault()
      document.querySelector<HTMLElement>(selector)?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleCrossfade = useCallback((position: number) => {
    setCrossfade(position)
    updateAppSettings({ crossfade: position })
  }, [])
  const [deckModels, setDeckModels] = useState<Record<DeckId, string | null>>({
    a: null,
    b: null,
  })
  const [ramInfo, setRamInfo] = useState<RamInfo | null>(null)

  const handleModelChange = useCallback(
    (deckId: DeckId, model: string | null, info: RamInfo | null) => {
      setDeckModels((previous) =>
        previous[deckId] === model ? previous : { ...previous, [deckId]: model },
      )
      // RAM info is machine-level and identical from both decks' hellos;
      // first one wins.
      if (info) setRamInfo((previous) => previous ?? info)
    },
    [],
  )

  const ramWarning = combinedRamWarning(deckModels, ramInfo)

  return (
    <main className="app">
      <h1 className="app__title">{t('app.title')}</h1>
      {ramWarning && (
        <p className="app__warning" role="status">
          {t('app.ramWarning', ramWarning)}
        </p>
      )}
      <div className="app__decks">
        <Deck id="a" onModelChange={handleModelChange} />
        <Deck id="b" onModelChange={handleModelChange} />
      </div>
      <Mixer crossfade={crossfade} onCrossfadeChange={handleCrossfade} />
      <p className="app__hint">{t('app.shortcutsHint')}</p>
    </main>
  )
}

export default App
