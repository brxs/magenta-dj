import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAudioEngine } from '../audio/engineContext'
import { Button } from '../ui/Button'
import { Slider } from '../ui/Slider'
import './mixer.css'

type MixerProps = {
  crossfade: number
  onCrossfadeChange: (position: number) => void
}

function downloadWav(blob: Blob) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `magenta-dj-${stamp}.wav`
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** The master section: equal-power crossfader between deck A and deck B,
 * and the session recorder tapping the master bus. Position state lives in
 * App; the audio-rate blend lives in the engine. */
export function Mixer({ crossfade, onCrossfadeChange }: MixerProps) {
  const { t } = useTranslation()
  const engine = useAudioEngine()
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const ticker = setInterval(
      () => setElapsedSeconds((seconds) => seconds + 1),
      1_000,
    )
    return () => clearInterval(ticker)
  }, [recording])

  function handleChange(position: number) {
    onCrossfadeChange(position)
    engine.setCrossfade(position)
  }

  async function toggleRecording() {
    try {
      if (!recording) {
        await engine.resume()
        await engine.startRecording()
        setElapsedSeconds(0)
        setRecording(true)
      } else {
        setRecording(false)
        downloadWav(await engine.stopRecording())
      }
      setError(null)
    } catch (cause) {
      setRecording(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className="mixer" aria-label={t('mixer.title')}>
      <span className="mixer__edge">{t('mixer.deckA')}</span>
      <div className="mixer__fader">
        <Slider
          label={t('mixer.crossfade')}
          min={0}
          max={1}
          step={0.01}
          value={crossfade}
          data-shortcut="crossfade"
          onChange={handleChange}
        />
      </div>
      <span className="mixer__edge">{t('mixer.deckB')}</span>
      <div className="mixer__record">
        <Button onClick={() => void toggleRecording()}>
          {recording ? t('mixer.stopRecording') : t('mixer.record')}
        </Button>
        {recording && (
          <span className="mixer__elapsed" role="status">
            {t('mixer.recordingFor', { time: formatElapsed(elapsedSeconds) })}
          </span>
        )}
        {error && (
          <span className="mixer__error" role="alert">
            {t('mixer.recordingError', { message: error })}
          </span>
        )}
      </div>
    </section>
  )
}
