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
  const stepMs = stepMinutes * 60 * 1000
  for (let ms = start.getTime(); ms <= end.getTime(); ms += stepMs) {
    const d = new Date(ms)
    out.push({ t: ms, caffeine_mg: totalCaffeineAt(entries, d, halfLifeHours) })
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
