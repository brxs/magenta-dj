import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: 'primary' | 'default'
}

export function Button({ variant = 'default', ...props }: ButtonProps) {
  const variantClass = variant === 'primary' ? ' ui-button--primary' : ''
  return <button className={`ui-button${variantClass}`} {...props} />
}
