import dayjs from 'dayjs'
import type { CaffeineEntry } from './types'

const MS_PER_HOUR = 1000 * 60 * 60

export function calculateRemaining(
  doseMg: number,
  elapsedHours: number,
  halfLifeHours: number
): number {
  if (doseMg <= 0 || halfLifeHours <= 0) return 0
  if (elapsedHours < 0) return 0
  return doseMg * Math.pow(0.5, elapsedHours / halfLifeHours)
}

/** Body weight in kg for threshold (1.5 mg/kg). */
export function weightToKg(value: number, unit: 'kg' | 'lb'): number {
  if (unit === 'kg') return value
  return value / 2.2046226218
}

export function sleepThresholdMg(weightKg: number): number {
  return 1.5 * weightKg
}

/**
 * Sleep-safe caffeine (mg): **1.5 mg/kg** from weight, or a manual mg when `useCustom`.
 */
export function effectiveSleepThresholdMg(
  weightKg: number,
  useCustom: boolean,
  customMg: number
): number {
  const recommended = sleepThresholdMg(weightKg)
  if (!useCustom) return recommended
  if (!Number.isFinite(customMg) || customMg < 0) return recommended
  return customMg
}

export function totalCaffeineAt(
  entries: CaffeineEntry[],
  at: Date,
  halfLifeHours: number
): number {
  const t = at.getTime()
  return entries.reduce((sum, entry) => {
    const entryTime = new Date(entry.timestamp).getTime()
    const elapsedMs = t - entryTime
    if (elapsedMs < 0) return sum
    const elapsedHours = elapsedMs / MS_PER_HOUR
    return sum + calculateRemaining(entry.caffeine_mg, elapsedHours, halfLifeHours)
  }, 0)
}

export interface ChartPoint {
  t: number
  caffeine_mg: number
}

/** Sample total caffeine from `start` to `end` every `stepMinutes`. */
export function buildSeries(
  entries: CaffeineEntry[],
  start: Date,
  end: Date,
  halfLifeHours: number,
  stepMinutes: number
): ChartPoint[] {
  const out: ChartPoint[] = []
  const endMs = end.getTime()
  let d = dayjs(start)
  while (d.valueOf() <= endMs) {
    const ms = d.valueOf()
    out.push({
      t: ms,
      caffeine_mg: totalCaffeineAt(entries, new Date(ms), halfLifeHours),
    })
    d = d.add(stepMinutes, 'minute')
  }
  return out
}

/**
 * Minutes from `from` until total caffeine is at or below threshold.
 * Returns 0 if already at/below; null if not reached within maxHours.
 */
export function minutesUntilBelowThreshold(
  entries: CaffeineEntry[],
  halfLifeHours: number,
  thresholdMg: number,
  from: Date,
  stepMinutes = 5,
  maxHours = 168
): number | null {
  const startTotal = totalCaffeineAt(entries, from, halfLifeHours)
  if (startTotal <= thresholdMg) return 0

  const stepMs = stepMinutes * 60 * 1000
  const endMs = from.getTime() + maxHours * MS_PER_HOUR
  for (let ms = from.getTime() + stepMs; ms <= endMs; ms += stepMs) {
    if (totalCaffeineAt(entries, new Date(ms), halfLifeHours) <= thresholdMg) {
      return (ms - from.getTime()) / (1000 * 60)
    }
  }
  return null
}

/**
 * First instant at/after `from` when total caffeine is at or below threshold
 * (same stepping as `minutesUntilBelowThreshold`). Returns `from` if already
 * at/below; `null` if not reached within `maxHours`.
 */
export function dateWhenBelowThreshold(
  entries: CaffeineEntry[],
  halfLifeHours: number,
  thresholdMg: number,
  from: Date,
  stepMinutes = 5,
  maxHours = 168
): Date | null {
  const startTotal = totalCaffeineAt(entries, from, halfLifeHours)
  if (startTotal <= thresholdMg) return from

  const stepMs = stepMinutes * 60 * 1000
  const endMs = from.getTime() + maxHours * MS_PER_HOUR
  for (let ms = from.getTime() + stepMs; ms <= endMs; ms += stepMs) {
    if (totalCaffeineAt(entries, new Date(ms), halfLifeHours) <= thresholdMg) {
      return new Date(ms)
    }
  }
  return null
}

/**
 * Scale catalog caffeine (mg) by serving size (fl oz).
 * Uses catalog fl oz as reference; if catalog oz is 0 or invalid, treats as 1 fl oz.
 */
export function scaledCaffeineMg(
  servingFlOz: number,
  catalogFlOz: number,
  catalogMg: number
): number {
  if (!Number.isFinite(servingFlOz) || servingFlOz < 0) return NaN
  if (!Number.isFinite(catalogMg)) return NaN
  const refOz = catalogFlOz > 0 && Number.isFinite(catalogFlOz) ? catalogFlOz : 1
  return Math.round((servingFlOz / refOz) * catalogMg)
}
