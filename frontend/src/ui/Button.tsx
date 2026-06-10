import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: 'primary' | 'default'
  /** LED-style active state for toggle buttons (e.g. channel CUE). */
  lit?: boolean
}

export function Button({ variant = 'default', lit = false, ...props }: ButtonProps) {
  const variantClass = variant === 'primary' ? ' ui-button--primary' : ''
  const litClass = lit ? ' ui-button--lit' : ''
  return <button className={`ui-button${variantClass}${litClass}`} {...props} />
}
