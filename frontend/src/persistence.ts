/** Last-used settings in localStorage, so a reload picks up where the
 * session left off. Tolerant on read: anything malformed loads as absent. */

import type { DeckId } from './audio/engine'
import type { PadPoint } from './deck/padWeights'

export type DeckSettings = {
  targets: (PadPoint & { text: string })[]
  cursor: PadPoint
  volume: number
}

export type AppSettings = {
  crossfade: number
}

const STORAGE_KEY = 'magenta-dj:v1'

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

type Persisted = {
  decks?: Partial<Record<DeckId, Partial<DeckSettings>>>
  app?: Partial<AppSettings>
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Persisted) : {}
  } catch {
    return {}
  }
}

function write(persisted: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch {
    // Storage full or unavailable — settings just don't persist.
  }
}

function isPoint(value: unknown): value is PadPoint {
  const point = value as PadPoint
  return (
    typeof point === 'object' &&
    point !== null &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  )
}

export function loadDeckSettings(deckId: DeckId): Partial<DeckSettings> {
  const stored = read().decks?.[deckId]
  if (!stored || typeof stored !== 'object') return {}
  const settings: Partial<DeckSettings> = {}
  if (
    Array.isArray(stored.targets) &&
    stored.targets.every(
      (target) => isPoint(target) && typeof target.text === 'string',
    )
  ) {
    settings.targets = stored.targets.map((target) => ({
      text: target.text,
      x: clamp01(target.x),
      y: clamp01(target.y),
    }))
  }
  if (isPoint(stored.cursor)) {
    settings.cursor = { x: clamp01(stored.cursor.x), y: clamp01(stored.cursor.y) }
  }
  if (Number.isFinite(stored.volume)) {
    settings.volume = clamp01(stored.volume as number)
  }
  return settings
}

export function updateDeckSettings(
  deckId: DeckId,
  partial: Partial<DeckSettings>,
) {
  const persisted = read()
  persisted.decks = {
    ...persisted.decks,
    [deckId]: { ...persisted.decks?.[deckId], ...partial },
  }
  write(persisted)
}

export function loadAppSettings(): Partial<AppSettings> {
  const stored = read().app
  if (!stored || typeof stored !== 'object') return {}
  return Number.isFinite(stored.crossfade)
    ? { crossfade: clamp01(stored.crossfade as number) }
    : {}
}

export function updateAppSettings(partial: Partial<AppSettings>) {
  const persisted = read()
  persisted.app = { ...persisted.app, ...partial }
  write(persisted)
}
