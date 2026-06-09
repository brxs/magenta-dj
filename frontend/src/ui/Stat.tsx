type StatProps = {
  label: string
  value: string
  tone?: 'default' | 'danger'
}

export function Stat({ label, value, tone = 'default' }: StatProps) {
  const toneClass = tone === 'danger' ? ' ui-stat--danger' : ''
  return (
    <div className={`ui-stat${toneClass}`}>
      <span className="ui-stat__label">{label}</span>
      <span className="ui-stat__value">{value}</span>
    </div>
  )
}
