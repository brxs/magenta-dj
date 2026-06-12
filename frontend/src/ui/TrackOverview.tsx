import { useEffect, useRef } from 'react'

/** One peaks bucket per canvas column — what callers pass to
 * getTrackPeaks so the envelope maps 1:1 onto pixels. */
export const TRACK_OVERVIEW_BUCKETS = 480

const WIDTH = TRACK_OVERVIEW_BUCKETS
const HEIGHT = 56
const KEY_SEEK_SECONDS = 5

type TrackOverviewProps = {
  label: string
  /** Static min/max envelope, one bucket per canvas column — drawn once
   * per track, unlike the live WaveformStrip's scrolling window. */
  peaks: { min: Float32Array; max: Float32Array } | null
  /** Playhead position and track length, in seconds. */
  position: number
  duration: number
  accent: 'a' | 'b'
  disabled?: boolean
  onSeek: (seconds: number) => void
}

/** Whole-track overview for a playback deck (M19, ADR-0013): the decoded
 * buffer's envelope with a playhead, clickable and arrow-key seekable —
 * the slider a live stream can never be. */
export function TrackOverview({
  label,
  peaks,
  position,
  duration,
  accent,
  disabled,
  onSeek,
}: TrackOverviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !peaks) return
    const trace =
      getComputedStyle(canvas)
        .getPropertyValue(`--color-deck-${accent}`)
        .trim() || '#ffffff'
    context.clearRect(0, 0, WIDTH, HEIGHT)
    context.fillStyle = trace
    const buckets = Math.min(peaks.min.length, WIDTH)
    for (let x = 0; x < buckets; x++) {
      // The same sqrt compression as the live strip, so dense material
      // shows its dynamics instead of pegging the view.
      const amplitude = Math.sqrt(
        Math.min(1, (peaks.max[x] - peaks.min[x]) / 2),
      )
      const half = Math.max(1, (amplitude * HEIGHT * 0.92) / 2)
      context.fillRect(x, HEIGHT / 2 - half, 1, half * 2)
    }
  }, [peaks, accent])

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || duration <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - rect.left) / rect.width
    onSeek(fraction * duration)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || duration <= 0) return
    const jumps: Record<string, number> = {
      ArrowLeft: position - KEY_SEEK_SECONDS,
      ArrowRight: position + KEY_SEEK_SECONDS,
      Home: 0,
      End: duration,
    }
    const next = jumps[event.key]
    if (next === undefined) return
    event.preventDefault()
    onSeek(next)
  }

  const fraction = duration > 0 ? Math.min(position / duration, 1) : 0

  return (
    <div
      className={`ui-trackoverview${disabled ? ' ui-trackoverview--disabled' : ''}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={seekFromPointer}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        className="ui-trackoverview__canvas"
        width={WIDTH}
        height={HEIGHT}
        aria-hidden="true"
      />
      <div
        className="ui-trackoverview__playhead"
        style={{ left: `${fraction * 100}%` }}
      />
    </div>
  )
}
