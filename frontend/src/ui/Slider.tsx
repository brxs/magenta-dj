import { useId } from 'react'

type SliderProps = {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

export function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  const id = useId()
  return (
    <div className="ui-slider">
      <label className="ui-slider__label" htmlFor={id}>
        {label}
      </label>
      <input
        className="ui-slider__input"
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
