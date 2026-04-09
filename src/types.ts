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
  /**
   * Catalog-only: listed reference size (fl oz) and caffeine (mg) for that size — used with
   * `sourceServingOz` to scale `caffeine_mg`. Legacy entries omit these; resolved from DB by name when possible.
   */
  sourceCatalogOz?: number
  sourceCatalogMg?: number
  /** Catalog-only: logged serving size (fl oz); updated when editing volume. */
  sourceServingOz?: number
  /** Custom-log icon when there is no `thumbnailUrl`; defaults to ☕ in the UI when omitted. */
  entryEmoji?: string
}

export interface AppSettings {
  weightValue: number
  weightUnit: WeightUnit
  halfLifeHours: number
  /**
   * When false, sleep-safe threshold is **1.5 mg/kg** from body weight (recommended).
   * When true, `sleepThresholdCustomMg` is used instead.
   */
  sleepThresholdUseCustom: boolean
  /** Milligrams; only used when `sleepThresholdUseCustom` is true. */
  sleepThresholdCustomMg: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  weightValue: 70,
  weightUnit: 'kg',
  halfLifeHours: 5,
  sleepThresholdUseCustom: false,
  sleepThresholdCustomMg: 105,
}
