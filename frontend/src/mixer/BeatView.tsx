import { useTranslation } from 'react-i18next'

import { Panel } from '../ui/Panel'
import { ZoomStrip } from '../ui/ZoomStrip'
import type { ZoomSource } from '../deck/useDeck'

type BeatViewProps = {
  getSourceA: () => ZoomSource | null
  getSourceB: () => ZoomSource | null
}

/** The visual beatmatcher (M22): both decks' band-coloured close-ups
 * stacked, playheads aligned mid-view — when M20 says the decks are
 * locked, the beat marks coincide. */
export function BeatView({ getSourceA, getSourceB }: BeatViewProps) {
  const { t } = useTranslation()
  return (
    <Panel className="beatview" aria-label={t('beatview.title')}>
      <ZoomStrip
        label={t('beatview.deck', { id: 'A' })}
        accent="a"
        getSource={getSourceA}
      />
      <ZoomStrip
        label={t('beatview.deck', { id: 'B' })}
        accent="b"
        getSource={getSourceB}
      />
    </Panel>
  )
}
