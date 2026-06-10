/** Global focus shortcuts: single letters jump focus to a control (via its
 * data-shortcut attribute) — ignored while typing or with modifiers held. */

const SHORTCUTS: Record<string, string> = {
  a: 'deck-a-prompt',
  b: 'deck-b-prompt',
  x: 'crossfade',
}

export function handleShortcutKey(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const origin = event.target as HTMLElement
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(origin.tagName)) return
  if (origin.isContentEditable) return
  const target = SHORTCUTS[event.key]
  if (!target) return
  event.preventDefault()
  document
    .querySelector<HTMLElement>(`[data-shortcut="${target}"]`)
    ?.focus()
}
