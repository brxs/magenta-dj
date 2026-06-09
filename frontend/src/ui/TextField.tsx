import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
}

export function TextField({ label, ...props }: TextFieldProps) {
  const id = useId()
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <input className="ui-field__input" id={id} type="text" {...props} />
    </div>
  )
}
