import type { ReactNode } from 'react'

/** Structural chrome: a flat inset panel with an optional silkscreen label,
 * replacing the floating-card look. */
export function Panel({
  label,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  label?: string
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  return (
    <section
      className={`ui-panel${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    >
      {label && <span className="ui-panel__label">{label}</span>}
      {children}
    </section>
  )
}
