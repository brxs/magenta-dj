import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../ui/Button'
import { Meter } from '../ui/Meter'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Stat } from '../ui/Stat'
import { TextField } from '../ui/TextField'
import { XYPad } from '../ui/XYPad'
import type { ActiveStyle, DeckState } from './deckState'
import { padWeights, spawnPosition, type PadPoint } from './padWeights'
import './deck.css'

// The worker holds ~3s of lead (see backend worker pacing); the meter shows
// health relative to that target.
const BUFFER_TARGET_SECONDS = 3
// Matches the backend's MAX_STYLE_PROMPTS.
const MAX_TARGETS = 8
// Cursor drags re-blend cached embeddings server-side; ~7/s is plenty when
// styles land at chunk boundaries anyway.
const STYLE_SEND_INTERVAL_MS = 150

type DeckPanelProps = {
  deckId: string
  state: DeckState
  volume: number
  onPlay: () => void
  onStop: () => void
  onSetStyle: (style: ActiveStyle) => void
  onSetModel: (model: string) => void
  onRestart: () => void
  onSetVolume: (volume: number) => void
}

export function DeckPanel({
  deckId,
  state,
  volume,
  onPlay,
  onStop,
  onSetStyle,
  onSetModel,
  onRestart,
  onSetVolume,
}: DeckPanelProps) {
  const { t } = useTranslation()
  const [targets, setTargets] = useState<(PadPoint & { text: string })[]>([])
  const [cursor, setCursor] = useState<PadPoint>({ x: 0.5, y: 0.5 })
  const [targetDraft, setTargetDraft] = useState('')
  const throttleRef = useRef<{ timer?: ReturnType<typeof setTimeout>; last: number }>({
    last: 0,
  })

  const connected = state.connection === 'open'
  const operable = connected && !state.switchingModel && !state.workerDied
  const statusKey = state.switchingModel
    ? 'deck.status.loadingModel'
    : {
        connecting: 'deck.status.connecting',
        open: 'deck.status.connected',
        closed: 'deck.status.disconnected',
      }[state.connection]
  const bufferFraction = state.bufferedSeconds / BUFFER_TARGET_SECONDS
  const bufferTone =
    !state.playing || bufferFraction >= 0.5 ? 'ok' : bufferFraction >= 0.25 ? 'warn' : 'danger'

  type Target = PadPoint & { text: string }

  function styleFor(nextTargets: Target[], nextCursor: PadPoint): ActiveStyle | null {
    if (nextTargets.length === 0) return null
    const weights = padWeights(nextTargets, nextCursor)
    return {
      prompts: nextTargets.map((target, index) => ({
        text: target.text,
        weight: weights[index],
      })),
    }
  }

  function sendStyle(nextTargets: Target[], nextCursor: PadPoint) {
    const style = styleFor(nextTargets, nextCursor)
    if (style) onSetStyle(style)
  }

  function sendStyleThrottled(nextTargets: Target[], nextCursor: PadPoint) {
    const throttle = throttleRef.current
    clearTimeout(throttle.timer)
    const elapsed = Date.now() - throttle.last
    if (elapsed >= STYLE_SEND_INTERVAL_MS) {
      throttle.last = Date.now()
      sendStyle(nextTargets, nextCursor)
    } else {
      // Trailing send so the gesture's resting place always lands.
      throttle.timer = setTimeout(() => {
        throttle.last = Date.now()
        sendStyle(nextTargets, nextCursor)
      }, STYLE_SEND_INTERVAL_MS - elapsed)
    }
  }

  function addTarget() {
    const text = targetDraft.trim()
    if (
      !text ||
      targets.some((target) => target.text === text) ||
      targets.length >= MAX_TARGETS
    ) {
      return
    }
    const next = [...targets, { text, ...spawnPosition(targets) }]
    setTargets(next)
    setTargetDraft('')
    sendStyle(next, cursor)
  }

  function removeTarget(text: string) {
    const next = targets.filter((target) => target.text !== text)
    setTargets(next)
    sendStyle(next, cursor)
  }

  function handleCursor(x: number, y: number) {
    const next = { x, y }
    setCursor(next)
    sendStyleThrottled(targets, next)
  }

  function handleTargetMove(id: string, x: number, y: number) {
    const next = targets.map((target) =>
      target.text === id ? { ...target, x, y } : target,
    )
    setTargets(next)
    sendStyleThrottled(next, cursor)
  }

  const activeSummary = state.activeStyle
    ? t('deck.style.active', {
        summary: state.activeStyle.prompts
          .filter((prompt) => prompt.weight >= 0.005)
          .sort((a, b) => b.weight - a.weight)
          .map((prompt) => `${Math.round(prompt.weight * 100)}% ${prompt.text}`)
          .join(' · '),
      })
    : ''

  const padTargets = targets.map((target) => ({
    id: target.text,
    label: target.text,
    x: target.x,
    y: target.y,
  }))

  return (
    <section className="deck" aria-label={t('deck.title', { id: deckId })}>
      <header className="deck__header">
        <h2 className="deck__title">{t('deck.title', { id: deckId })}</h2>
        <span
          className={`deck__status${connected ? '' : ' deck__status--disconnected'}`}
        >
          {t(statusKey)}
        </span>
      </header>

      {/* Deliberately usable while the worker is dead: switching to a model
          that fits is the recovery path when the chosen one cannot load. */}
      <Select
        label={t('deck.model.label')}
        value={state.model ?? ''}
        options={state.availableModels.length ? state.availableModels : [state.model ?? '']}
        disabled={!connected || state.switchingModel}
        onChange={onSetModel}
      />

      <div className="deck__prompt-row">
        <TextField
          label={t('deck.style.target')}
          placeholder={t('deck.style.targetPlaceholder')}
          value={targetDraft}
          onChange={(event) => setTargetDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addTarget()
          }}
        />
        <Button
          onClick={addTarget}
          disabled={!operable || !targetDraft.trim() || targets.length >= MAX_TARGETS}
        >
          {t('deck.style.addTarget')}
        </Button>
      </div>

      {targets.length > 0 && (
        <ul className="deck__targets">
          {targets.map((target) => (
            <li key={target.text}>
              <button
                className="deck__target-chip"
                onClick={() => removeTarget(target.text)}
                disabled={!operable}
                aria-label={t('deck.style.removeTarget', { prompt: target.text })}
              >
                {target.text} ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <XYPad
        label={t('deck.style.pad')}
        targets={padTargets}
        cursor={cursor}
        disabled={!operable || targets.length === 0}
        onChange={handleCursor}
        onTargetMove={handleTargetMove}
      />

      <p className="deck__active-prompt">{activeSummary}</p>

      <div className="deck__transport">
        {state.playing ? (
          <Button variant="primary" onClick={onStop} disabled={!operable}>
            {t('deck.stop')}
          </Button>
        ) : (
          <Button variant="primary" onClick={onPlay} disabled={!operable}>
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

      {state.workerDied && (
        <div className="deck__recovery" role="alert">
          <p className="deck__error">{t('deck.worker.died')}</p>
          <Button onClick={onRestart} disabled={!connected}>
            {t('deck.worker.restart')}
          </Button>
        </div>
      )}

      {state.error && !state.workerDied && (
        <p className="deck__error" role="alert">
          {t('deck.error.message', { message: state.error })}
        </p>
      )}
    </section>
  )
}
