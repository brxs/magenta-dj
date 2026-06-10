import { useEffect, useState } from 'react'

import { litSegments, segmentTone } from './meterMath'

const SEGMENTS = 14
const FRAME_INTERVAL_MS = 50

type LevelMeterProps = {
  label: string
  /** Polled ~20×/s for the current level (0..~1). */
  getLevel: () => number
}

/** Segmented LED column for a live signal level. */
export function LevelMeter({ label, getLevel }: LevelMeterProps) {
  const [lit, setLit] = useState(0)

  useEffect(() => {
    const ticker = setInterval(
      () => setLit(litSegments(getLevel(), SEGMENTS)),
      FRAME_INTERVAL_MS,
    )
    return () => clearInterval(ticker)
  }, [getLevel])

  return (
    <div className="ui-levelmeter" role="img" aria-label={label}>
      {Array.from({ length: SEGMENTS }, (_, index) => {
        const fromTop = SEGMENTS - 1 - index
        const on = fromTop < lit
        return (
          <span
            key={index}
            className={`ui-levelmeter__segment ui-levelmeter__segment--${segmentTone(fromTop, SEGMENTS)}${on ? ' ui-levelmeter__segment--on' : ''}`}
          />
        )
      })}
    </div>
  )
}
