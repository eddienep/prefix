import type { AppSettings, CaffeineEntry } from './types'
import { DEFAULT_SETTINGS } from './types'

const STORAGE_KEY = 'caffeine-half-life-tracker-v1'

export interface PersistedState {
  entries: CaffeineEntry[]
  settings: AppSettings
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { entries: [], settings: { ...DEFAULT_SETTINGS } }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
        weightUnit:
          parsed.settings?.weightUnit === 'lb' ? 'lb' : 'kg',
      },
    }
  } catch {
    return { entries: [], settings: { ...DEFAULT_SETTINGS } }
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / private mode */
  }
}
