type TransportButtonProps = {
  kind: 'play' | 'stop'
  label: string
  accent?: 'a' | 'b'
  disabled?: boolean
  onClick: () => void
}

/** Large square transport control with an icon glyph; lights in the deck's
 * accent while its action is the active state. */
export function TransportButton({
  kind,
  label,
  accent = 'a',
  disabled,
  onClick,
}: TransportButtonProps) {
  return (
    <button
      className={`ui-transport ui-transport--${accent}${kind === 'stop' ? ' ui-transport--lit' : ''}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {kind === 'play' ? (
          <polygon points="8,5 19,12 8,19" />
        ) : (
          <rect x="7" y="7" width="10" height="10" />
        )}
      </svg>
    </button>
  )
}
