/** Pure math for LED level meters: how many segments light for a level and
 * what colour each segment is. */

export function litSegments(level: number, total: number): number {
  // Audio RMS rarely exceeds ~0.5; a sqrt curve spreads useful range
  // across the column instead of bunching it at the bottom.
  const shaped = Math.sqrt(Math.min(1, Math.max(0, level * 2)))
  return Math.round(shaped * total)
}

export function segmentTone(
  index: number,
  total: number,
): 'ok' | 'warn' | 'danger' {
  const position = (index + 1) / total
  if (position > 0.9) return 'danger'
  if (position > 0.7) return 'warn'
  return 'ok'
}
