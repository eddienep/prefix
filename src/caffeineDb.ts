import raw from './caffeineDatabase.json'
import { GENERIC_CAFFEINE_ITEMS } from './genericCaffeineItems'

export type CaffeineSourceRow = {
  name: string
  oz: number
  mg: number
  image_url: string
  category: string
  /** Picker / preview when `image_url` is empty (generic shortcuts). */
  listEmoji?: string
}

/** Logged from “Custom”; re-tap prefills the custom entry sheet. */
export type CustomRecentPickRow = {
  pickKind: 'custom'
  label: string
  mg: number
  entryEmoji?: string
  recentKey: string
}

export type CaffeinePickerRow = CaffeineSourceRow | CustomRecentPickRow

export function isCustomRecentPickRow(
  r: CaffeinePickerRow
): r is CustomRecentPickRow {
  return 'pickKind' in r && r.pickKind === 'custom'
}

export type CaffeinePickerSection = {
  title: string
  key: string
  data: CaffeinePickerRow[]
}

const loaded = raw as CaffeineSourceRow[]

/** Full CSV-derived list (includes 0 mg items). */
export const CAFFEINE_SOURCE_ITEMS: CaffeineSourceRow[] = loaded

/** Drinks with measurable caffeine — used for the picker. */
export const CAFFEINE_ITEMS_WITH_CAFFEINE: CaffeineSourceRow[] =
  CAFFEINE_SOURCE_ITEMS.filter((r) => r.mg > 0)

/** Generic shortcuts first, then CSV catalog; duplicate `name` keeps the generic row. */
export const CAFFEINE_PICKER_ITEMS: CaffeineSourceRow[] = (() => {
  const seen = new Set<string>()
  const out: CaffeineSourceRow[] = []
  for (const r of GENERIC_CAFFEINE_ITEMS) {
    if (seen.has(r.name)) continue
    seen.add(r.name)
    out.push(r)
  }
  for (const r of CAFFEINE_ITEMS_WITH_CAFFEINE) {
    if (seen.has(r.name)) continue
    seen.add(r.name)
    out.push(r)
  }
  return out
})()

const PICKER_DB_NAMES = new Set(CAFFEINE_PICKER_ITEMS.map((r) => r.name))

export type EntryForRecentPick = {
  timestamp: string
  label: string
  caffeine_mg: number
  sourceProductName?: string
  entryEmoji?: string
}

/**
 * Recent picker rows (newest first, deduped): catalog items and custom logs.
 * Custom logs are identified by missing `sourceProductName` except legacy catalog
 * rows that match DB by label only and have no `entryEmoji`.
 */
export function recentPickerRowsFromEntries(
  entries: readonly EntryForRecentPick[],
  dbNames: ReadonlySet<string> = PICKER_DB_NAMES,
  db: readonly CaffeineSourceRow[] = CAFFEINE_PICKER_ITEMS
): CaffeinePickerRow[] {
  const byName = new Map(db.map((r) => [r.name, r]))
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  const ordered: CaffeinePickerRow[] = []
  const seen = new Set<string>()
  for (const e of sorted) {
    const labelTrim = e.label.trim() || 'Caffeine'
    const explicit = e.sourceProductName?.trim()

    let dbRow: CaffeineSourceRow | null = null
    let dedupeKey: string | null = null

    if (explicit && dbNames.has(explicit)) {
      dbRow = byName.get(explicit) ?? null
      dedupeKey = `db:${explicit}`
    } else if (
      !explicit &&
      e.entryEmoji === undefined &&
      dbNames.has(labelTrim)
    ) {
      dbRow = byName.get(labelTrim) ?? null
      dedupeKey = `db:${labelTrim}`
    }

    if (dbRow && dedupeKey) {
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      ordered.push(dbRow)
    } else {
      const recentKey = `custom:${labelTrim}:${e.caffeine_mg}:${e.entryEmoji ?? ''}`
      if (seen.has(recentKey)) continue
      seen.add(recentKey)
      ordered.push({
        pickKind: 'custom',
        label: labelTrim,
        mg: e.caffeine_mg,
        entryEmoji: e.entryEmoji,
        recentKey,
      })
    }

    if (ordered.length >= 30) break
  }
  return ordered
}

/**
 * Build SectionList sections:
 * - **Search:** one "Results" section over the full picker DB (generic + catalog).
 * - **Browse:** "Recent" (if any) and a single "Generic" section only; other
 *   catalog products appear only when the user searches.
 */
/**
 * True when every whitespace-separated token appears somewhere in the row’s
 * searchable text (name + category). Matches user expectation for queries like
 * “starbucks coffee” vs requiring the exact substring “starbucks coffee”.
 */
function sourceRowMatchesQuery(
  queryNormalized: string,
  row: Pick<CaffeineSourceRow, 'name' | 'category'>
): boolean {
  const q = queryNormalized.trim()
  if (!q) return true
  const tokens = q.split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return true
  const haystack = `${row.name} ${row.category}`.toLowerCase()
  return tokens.every((t) => haystack.includes(t))
}

export function buildCaffeinePickerSections(
  query: string,
  recentRows: readonly CaffeinePickerRow[],
  db: readonly CaffeineSourceRow[] = CAFFEINE_PICKER_ITEMS
): CaffeinePickerSection[] {
  const q = query.trim().toLowerCase()
  const match = (row: CaffeineSourceRow) => sourceRowMatchesQuery(q, row)

  if (q.length > 0) {
    const data = db.filter(match).sort((a, b) => a.name.localeCompare(b.name))
    return data.length > 0
      ? [{ title: 'Results', key: 'results', data }]
      : []
  }

  const recentItems: CaffeinePickerRow[] = []
  const recentSeen = new Set<string>()
  for (const r of recentRows) {
    if (isCustomRecentPickRow(r)) {
      if (recentSeen.has(r.recentKey)) continue
      recentSeen.add(r.recentKey)
      recentItems.push(r)
    } else if (match(r) && !recentSeen.has(r.name)) {
      recentSeen.add(r.name)
      recentItems.push(r)
    }
  }

  const sections: CaffeinePickerSection[] = []
  if (recentItems.length > 0) {
    sections.push({ title: 'Recent', key: 'recent', data: recentItems })
  }

  const recentNameSet = new Set(
    recentItems.map((r) => (isCustomRecentPickRow(r) ? null : r.name)).filter(
      (n): n is string => n != null
    )
  )

  const genericData = GENERIC_CAFFEINE_ITEMS.filter(
    (row) => !recentNameSet.has(row.name)
  )
  if (genericData.length > 0) {
    sections.push({
      title: 'Generic',
      key: 'generic',
      data: genericData,
    })
  }

  return sections
}
