import { useEffect, useRef } from 'react'

const WIDTH = 480
const HEIGHT = 56

type WaveformStripProps = {
  label: string
  /** Polled per frame for the latest window's [min, max] in -1..1. */
  getRange: () => [number, number]
  /** Design-token custom-property name for the trace, e.g. '--color-deck-a'
   * (canvas fillStyle cannot resolve var() itself). */
  traceToken: string
}

/** Scrolling waveform: each animation frame shifts the strip left and draws
 * the newest window's min/max as a column on the right edge. */
export function WaveformStrip({ label, getRange, traceToken }: WaveformStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const trace =
      getComputedStyle(canvas).getPropertyValue(traceToken).trim() || '#ffffff'
    let frame = 0
    const draw = () => {
      const [low, high] = getRange()
      context.drawImage(canvas, -1, 0)
      context.clearRect(WIDTH - 1, 0, 1, HEIGHT)
      // sqrt-compress the amplitude so dense material still shows dynamics
      // instead of pegging the strip.
      const amplitude = Math.sqrt(Math.min(1, (high - low) / 2))
      const half = Math.max(1, (amplitude * HEIGHT * 0.92) / 2)
      context.fillStyle = trace
      context.fillRect(WIDTH - 1, HEIGHT / 2 - half, 1, half * 2)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [getRange, traceToken])

  return (
    <canvas
      ref={canvasRef}
      className="ui-waveform"
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={label}
    />
  )
}
