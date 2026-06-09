type MeterProps = {
  label: string
  valueLabel: string
  /** 0..1 fraction of the track to fill. */
  fraction: number
  tone?: 'ok' | 'warn' | 'danger'
}

export function Meter({ label, valueLabel, fraction, tone = 'ok' }: MeterProps) {
  const toneClass = tone === 'ok' ? '' : ` ui-meter--${tone}`
  const width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
  return (
    <div className={`ui-meter${toneClass}`}>
      <span className="ui-meter__label">
        <span>{label}</span>
        <span>{valueLabel}</span>
      </span>
      <div className="ui-meter__track">
        <div className="ui-meter__fill" style={{ width }} />
      </div>
    </div>
  )
}
