export type WeightUnit = 'kg' | 'lb'

export interface CaffeineEntry {
  id: string
  timestamp: string
  caffeine_mg: number
  label: string
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
