/** Last-used settings in localStorage, so a reload picks up where the
 * session left off. Tolerant on read: anything malformed loads as absent. */

import type { DeckId } from './audio/engine'
import { EQ_BANDS, type EqBand } from './audio/eq'
import { FX_KINDS, type FxKind } from './audio/fx'
import type { AudioOutputDevice } from './audio/outputs'
import type { PadPoint } from './deck/padWeights'

export type DeckSettings = {
  targets: (PadPoint & { text: string })[]
  cursor: PadPoint
  volume: number
  eq: Record<EqBand, number>
  fx: { kind: FxKind | null; amount: number }
}

export type AppSettings = {
  crossfade: number
  cueMix: number
  cueDevice: AudioOutputDevice | null
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
  const eq = stored.eq
  if (
    eq &&
    typeof eq === 'object' &&
    EQ_BANDS.every((band) => Number.isFinite(eq[band]))
  ) {
    settings.eq = Object.fromEntries(
      EQ_BANDS.map((band) => [band, clamp01(eq[band] as number)]),
    ) as Record<EqBand, number>
  }
  const fx = stored.fx
  if (
    fx &&
    typeof fx === 'object' &&
    (fx.kind === null || FX_KINDS.includes(fx.kind as FxKind)) &&
    Number.isFinite(fx.amount)
  ) {
    settings.fx = { kind: fx.kind, amount: clamp01(fx.amount as number) }
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
  const settings: Partial<AppSettings> = {}
  if (Number.isFinite(stored.crossfade)) {
    settings.crossfade = clamp01(stored.crossfade as number)
  }
  if (Number.isFinite(stored.cueMix)) {
    settings.cueMix = clamp01(stored.cueMix as number)
  }
  const cueDevice = stored.cueDevice
  if (cueDevice === null) {
    settings.cueDevice = null
  } else if (
    cueDevice &&
    typeof cueDevice.deviceId === 'string' &&
    typeof cueDevice.label === 'string'
  ) {
    settings.cueDevice = {
      deviceId: cueDevice.deviceId,
      label: cueDevice.label,
      ...(cueDevice.backend === true ? { backend: true } : {}),
    }
  }
  return settings
}

export function updateAppSettings(partial: Partial<AppSettings>) {
  const persisted = read()
  persisted.app = { ...persisted.app, ...partial }
  write(persisted)
}
