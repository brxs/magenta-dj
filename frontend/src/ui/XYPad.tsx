import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'

export type XYPadTarget = {
  id: string
  label: string
  x: number
  y: number
}

type XYPadProps = {
  label: string
  targets: XYPadTarget[]
  cursor: { x: number; y: number }
  disabled?: boolean
  onChange: (x: number, y: number) => void
  /** When provided, target dots are draggable. */
  onTargetMove?: (id: string, x: number, y: number) => void
}

const KEYBOARD_STEP = 0.05

type Drag = { kind: 'cursor' } | { kind: 'target'; id: string }

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

/** A 2D control surface: labelled targets and one cursor. Dragging the
 * surface moves the cursor; dragging a dot repositions that target (so
 * targets can be clustered). Arrow keys nudge the cursor. All positions are
 * normalized 0..1 in both axes. */
export function XYPad({
  label,
  targets,
  cursor,
  disabled,
  onChange,
  onTargetMove,
}: XYPadProps) {
  const id = useId()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)

  function pointerPosition(event: PointerEvent<HTMLDivElement>) {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    }
  }

  function applyDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const position = pointerPosition(event)
    if (!drag || !position) return
    if (drag.kind === 'target') {
      onTargetMove?.(drag.id, position.x, position.y)
    } else {
      onChange(position.x, position.y)
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return
    const grabbedTarget = (event.target as HTMLElement)
      .closest?.('[data-target-id]')
      ?.getAttribute('data-target-id')
    dragRef.current =
      grabbedTarget && onTargetMove
        ? { kind: 'target', id: grabbedTarget }
        : { kind: 'cursor' }
    // jsdom has no pointer capture; in browsers it keeps the drag alive
    // outside the surface.
    surfaceRef.current?.setPointerCapture?.(event.pointerId)
    applyDrag(event)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !dragRef.current) return
    applyDrag(event)
  }

  function handlePointerEnd() {
    dragRef.current = null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowDown: [0, KEYBOARD_STEP],
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    onChange(clamp01(cursor.x + step[0]), clamp01(cursor.y + step[1]))
  }

  return (
    <div className="ui-xypad">
      <span className="ui-xypad__label" id={id}>
        {label}
      </span>
      <div
        ref={surfaceRef}
        className={`ui-xypad__surface${disabled ? ' ui-xypad__surface--disabled' : ''}`}
        role="application"
        aria-labelledby={id}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {targets.map((target) => (
          <span
            key={target.id}
            className={`ui-xypad__target${onTargetMove ? ' ui-xypad__target--draggable' : ''}`}
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
            data-target-id={target.id}
          >
            <span className="ui-xypad__target-dot" />
            <span className="ui-xypad__target-label">{target.label}</span>
          </span>
        ))}
        <span
          className="ui-xypad__cursor"
          style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
        />
      </div>
    </div>
  )
}
