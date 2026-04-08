import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AppSettings, CaffeineEntry } from './types'
import { DEFAULT_SETTINGS } from './types'

const STORAGE_KEY = 'caffeine-half-life-tracker-v1'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface PersistedState {
  entries: CaffeineEntry[]
  settings: AppSettings
  themePreference: ThemePreference
  /** Product names from the caffeine database, most-recent first (for Log modal). */
  recentCaffeineSourceNames?: string[]
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        entries: [],
        settings: { ...DEFAULT_SETTINGS },
        themePreference: 'system',
        recentCaffeineSourceNames: undefined,
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      themePreference?: string
    }
    const themePreference: ThemePreference =
      parsed.themePreference === 'light' ||
      parsed.themePreference === 'dark' ||
      parsed.themePreference === 'system'
        ? parsed.themePreference
        : 'system'
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
        weightUnit: parsed.settings?.weightUnit === 'lb' ? 'lb' : 'kg',
      },
      themePreference,
      recentCaffeineSourceNames: Array.isArray(parsed.recentCaffeineSourceNames)
        ? parsed.recentCaffeineSourceNames.filter((x) => typeof x === 'string')
        : undefined,
    }
  } catch {
    return {
      entries: [],
      settings: { ...DEFAULT_SETTINGS },
      themePreference: 'system',
      recentCaffeineSourceNames: undefined,
    }
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
