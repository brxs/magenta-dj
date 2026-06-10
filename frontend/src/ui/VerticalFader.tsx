import { useId } from 'react'

type VerticalFaderProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  accent?: 'a' | 'b' | 'master'
  disabled?: boolean
  onChange: (value: number) => void
}

/** Channel fader: a native range input rotated upright, so value semantics,
 * keyboard, and test tooling stay native while the visual is a fader. */
export function VerticalFader({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  accent = 'master',
  disabled,
  onChange,
}: VerticalFaderProps) {
  const id = useId()
  return (
    <div className={`ui-vfader ui-vfader--${accent}`}>
      <div className="ui-vfader__well">
        <input
          className="ui-vfader__input"
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <label className="ui-vfader__label" htmlFor={id}>
        {label}
      </label>
    </div>
  )
}
