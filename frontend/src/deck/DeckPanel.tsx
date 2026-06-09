import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/Button'
import { Meter } from '../ui/Meter'
import { Slider } from '../ui/Slider'
import { Stat } from '../ui/Stat'
import { TextField } from '../ui/TextField'
import type { DeckState } from './deckState'
import './deck.css'

// The worker holds ~3s of lead (see backend worker pacing); the meter shows
// health relative to that target.
const BUFFER_TARGET_SECONDS = 3

type DeckPanelProps = {
  deckId: string
  state: DeckState
  volume: number
  onPlay: () => void
  onStop: () => void
  onSetPrompt: (prompt: string) => void
  onSetVolume: (volume: number) => void
}

export function DeckPanel({
  deckId,
  state,
  volume,
  onPlay,
  onStop,
  onSetPrompt,
  onSetVolume,
}: DeckPanelProps) {
  const { t } = useTranslation()
  const [promptDraft, setPromptDraft] = useState('')

  const connected = state.connection === 'open'
  const statusKey = {
    connecting: 'deck.status.connecting',
    open: 'deck.status.connected',
    closed: 'deck.status.disconnected',
  }[state.connection]
  const bufferFraction = state.bufferedSeconds / BUFFER_TARGET_SECONDS
  const bufferTone =
    !state.playing || bufferFraction >= 0.5 ? 'ok' : bufferFraction >= 0.25 ? 'warn' : 'danger'

  function applyPrompt() {
    const prompt = promptDraft.trim()
    if (prompt) onSetPrompt(prompt)
  }

  return (
    <section className="deck" aria-label={t('deck.title', { id: deckId })}>
      <header className="deck__header">
        <h2 className="deck__title">{t('deck.title', { id: deckId })}</h2>
        <span className="deck__model">{state.model ?? ''}</span>
        <span
          className={`deck__status${connected ? '' : ' deck__status--disconnected'}`}
        >
          {t(statusKey)}
        </span>
      </header>

      <div className="deck__prompt-row">
        <TextField
          label={t('deck.prompt.label')}
          placeholder={t('deck.prompt.placeholder')}
          value={promptDraft}
          onChange={(event) => setPromptDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyPrompt()
          }}
        />
        <Button onClick={applyPrompt} disabled={!connected || !promptDraft.trim()}>
          {t('deck.prompt.apply')}
        </Button>
      </div>
      <p className="deck__active-prompt">
        {state.activePrompt ? t('deck.prompt.active', { prompt: state.activePrompt }) : ''}
      </p>

      <div className="deck__transport">
        {state.playing ? (
          <Button variant="primary" onClick={onStop} disabled={!connected}>
            {t('deck.stop')}
          </Button>
        ) : (
          <Button variant="primary" onClick={onPlay} disabled={!connected}>
            {t('deck.play')}
          </Button>
        )}
      </div>

      <Slider
        label={t('deck.volume')}
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={onSetVolume}
      />

      <div className="deck__health">
        <Meter
          label={t('deck.health.buffer')}
          valueLabel={t('deck.health.bufferSeconds', {
            seconds: state.bufferedSeconds.toFixed(1),
          })}
          fraction={bufferFraction}
          tone={bufferTone}
        />
        <Stat
          label={t('deck.health.underruns')}
          value={String(state.underruns)}
          tone={state.underruns > 0 ? 'danger' : 'default'}
        />
        <Stat
          label={t('deck.health.generationSpeed')}
          value={
            state.generationSpeed === null
              ? t('deck.health.noData')
              : t('deck.health.generationSpeedValue', {
                  rtf: state.generationSpeed.toFixed(2),
                })
          }
          tone={
            state.generationSpeed !== null && state.generationSpeed < 1
              ? 'danger'
              : 'default'
          }
        />
      </div>

      {state.error && (
        <p className="deck__error" role="alert">
          {t('deck.error.message', { message: state.error })}
        </p>
      )}
    </section>
  )
}
