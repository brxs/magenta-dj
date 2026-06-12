import { useEffect, useRef } from 'react'

const WIDTH = 720
const HEIGHT = 88
/** The close-up's window: a few bars at club tempo. */
const WINDOW_SECONDS = 4
/** Scratch capacity: the worst case is varispeed's fast end packing
 * more hops into the window. */
const MAX_HOPS = 512
/** RMS → pixel scaling: sqrt-compressed like the live strip, gained
 * so techno sits around two-thirds height. */
const AMPLITUDE_GAIN = 1.8

type ZoomStripSource = {
  bands: {
    copyWindow: (
      fromHop: number,
      target: { low: Float32Array; mid: Float32Array; high: Float32Array },
    ) => void
  }
  playheadHop: number
  realSecondsPerHop: number
  beat: { periodHops: number; anchorHop: number } | null
}

type ZoomStripProps = {
  label: string
  accent: 'a' | 'b'
  /** Time runs downward instead of rightward (the Serato vertical
   * waveform convention) — same drawing, transposed onto the canvas. */
  vertical?: boolean
  /** Polled per frame; null draws an empty (dimmed) strip — a deck
   * with nothing honest to show shows nothing (M22). */
  getSource: () => ZoomStripSource | null
}

/** One deck's scrolling band-coloured close-up (M22): lows, mids and
 * highs as colour, the playhead fixed mid-strip, beat marks from the
 * deck's M20 clock where confident. Canvas-rendered per frame; React
 * never sees the scroll. */
export function ZoomStrip({ label, accent, vertical, getSource }: ZoomStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const styles = getComputedStyle(canvas)
    const colour = (token: string, fallback: string) =>
      styles.getPropertyValue(token).trim() || fallback
    const low = colour('--color-wave-low', '#3d6fe0')
    const mid = colour('--color-wave-mid', '#e0a33c')
    const high = colour('--color-wave-high', '#e8edf2')
    const marks = colour('--color-wave-beat', '#ff4757')
    const playhead = colour(`--color-deck-${accent}`, '#ffffff')
    const scratch = {
      low: new Float32Array(MAX_HOPS),
      mid: new Float32Array(MAX_HOPS),
      high: new Float32Array(MAX_HOPS),
    }

    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      // Vertical strips transpose the same drawing: the horizontal
      // time axis maps downward, amplitude maps across.
      if (vertical) context.setTransform(0, 1, 1, 0, 0, 0)
      const source = getSource()
      if (!source) return
      const hops = Math.min(
        MAX_HOPS - 1,
        Math.ceil(WINDOW_SECONDS / source.realSecondsPerHop),
      )
      const fromHop = source.playheadHop - hops / 2
      // The band window quantises to whole hops but the playhead and
      // beat marks do not: draw bands from the floored origin (one
      // extra hop covers the right edge) so the waveform glides in
      // step with the marks instead of stepping a fraction ahead.
      const flooredFrom = Math.floor(fromHop)
      const window = {
        low: scratch.low.subarray(0, hops + 1),
        mid: scratch.mid.subarray(0, hops + 1),
        high: scratch.high.subarray(0, hops + 1),
      }
      source.bands.copyWindow(flooredFrom, window)
      const pxPerHop = WIDTH / hops
      const centre = HEIGHT / 2
      const height = (value: number) =>
        Math.min(1, Math.sqrt(value) * AMPLITUDE_GAIN) * (HEIGHT * 0.94)
      for (let i = 0; i <= hops; i++) {
        const x = (flooredFrom + i - fromHop) * pxPerHop
        const width = Math.max(1, pxPerHop)
        const bands = [
          [window.low[i], low],
          [window.mid[i], mid],
          [window.high[i], high],
        ] as const
        for (const [value, fill] of bands) {
          if (value <= 0) continue
          const h = height(value)
          context.fillStyle = fill
          context.fillRect(x, centre - h / 2, width, h)
        }
      }
      // Beat marks where the deck's clock is confident: full-height
      // lines, every fourth heavier — the lattice the eyes match.
      // The heavy marks count bars within a strip only: each deck's
      // anchor is an arbitrary beat, so two locked decks coincide on
      // the per-beat lattice, not necessarily on the heavy ones.
      if (source.beat) {
        const { periodHops, anchorHop } = source.beat
        context.fillStyle = marks
        const firstIndex = Math.ceil((fromHop - anchorHop) / periodHops)
        for (let k = firstIndex; ; k++) {
          const hop = anchorHop + k * periodHops
          if (hop >= fromHop + hops) break
          const x = (hop - fromHop) * pxPerHop
          const heavy = ((k % 4) + 4) % 4 === 0
          // Grid-red over the band colours; the muted gray that
          // shipped first was invisible on the device.
          context.globalAlpha = heavy ? 1 : 0.7
          context.fillRect(Math.round(x), 0, heavy ? 3 : 2, HEIGHT)
        }
        context.globalAlpha = 1
      }
      // The playhead sits mid-strip; the audio scrolls beneath it.
      context.fillStyle = playhead
      context.fillRect(WIDTH / 2 - 1, 0, 2, HEIGHT)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [getSource, accent, vertical])

  return (
    <canvas
      ref={canvasRef}
      className={`ui-zoomstrip${vertical ? ' ui-zoomstrip--vertical' : ''}`}
      width={vertical ? HEIGHT : WIDTH}
      height={vertical ? WIDTH : HEIGHT}
      role="img"
      aria-label={label}
    />
  )
}
