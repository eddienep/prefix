export type WeightUnit = 'kg' | 'lb'

export interface CaffeineEntry {
  id: string
  timestamp: string
  caffeine_mg: number
  label: string
  /** Optional image URL shown in the consumption list; falls back to ☕ when missing or invalid. */
  thumbnailUrl?: string
  /**
   * When logged from the product database, the canonical catalog name (for picker “Recent”).
   * Omitted for custom logs; label may differ from this after editing.
   */
  sourceProductName?: string
  /** Custom-log icon when there is no `thumbnailUrl`; defaults to ☕ in the UI when omitted. */
  entryEmoji?: string
}

export interface AppSettings {
  weightValue: number
  weightUnit: WeightUnit
  halfLifeHours: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  weightValue: 70,
  weightUnit: 'kg',
  halfLifeHours: 5,
}
