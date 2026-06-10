import { useId } from 'react'

export type KnobAccent = 'a' | 'b' | 'master'

type KnobProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  accent?: KnobAccent
  disabled?: boolean
  'data-shortcut'?: string
  onChange: (value: number) => void
}

const SIZE = 44
const RADIUS = 17
const SWEEP_DEGREES = 270
const START_DEGREES = -225 // 7-o'clock start, 270° clockwise sweep

function polar(angleDegrees: number) {
  const radians = (angleDegrees * Math.PI) / 180
  return {
    x: SIZE / 2 + RADIUS * Math.cos(radians),
    y: SIZE / 2 - RADIUS * Math.sin(radians),
  }
}

function arcPath(fromDegrees: number, toDegrees: number) {
  const start = polar(fromDegrees)
  const end = polar(toDegrees)
  const largeArc = Math.abs(fromDegrees - toDegrees) > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

/** Rotary control: an SVG arc dial over a real (invisible) range input, so
 * keyboard, labels, and test tooling keep native input semantics. */
export function Knob({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  accent = 'master',
  disabled,
  'data-shortcut': dataShortcut,
  onChange,
}: KnobProps) {
  const id = useId()
  const fraction = (value - min) / (max - min)
  const valueAngle = START_DEGREES + SWEEP_DEGREES * fraction
  const pointer = polar(valueAngle)

  return (
    <div className={`ui-knob ui-knob--${accent}${disabled ? ' ui-knob--disabled' : ''}`}>
      <div className="ui-knob__dial">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <path className="ui-knob__track" d={arcPath(START_DEGREES, START_DEGREES + SWEEP_DEGREES)} />
          <path className="ui-knob__value" d={arcPath(START_DEGREES, valueAngle)} />
          <circle className="ui-knob__cap" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS - 5} />
          <line
            className="ui-knob__pointer"
            x1={SIZE / 2}
            y1={SIZE / 2}
            x2={pointer.x}
            y2={pointer.y}
          />
        </svg>
        <input
          className="ui-knob__input"
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          data-shortcut={dataShortcut}
          onChange={(event) => onChange(Number(event.target.value))}
          onDoubleClick={() => onChange((min + max) / 2)}
        />
      </div>
      <label className="ui-knob__label" htmlFor={id}>
        {label}
      </label>
    </div>
  )
}
