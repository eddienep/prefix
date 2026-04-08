import raw from './caffeineDatabase.json'

export type CaffeineSourceRow = {
  name: string
  oz: number
  mg: number
  image_url: string
  category: string
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

const DB_NAMES_WITH_CAFFEINE = new Set(
  CAFFEINE_ITEMS_WITH_CAFFEINE.map((r) => r.name)
)

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
  dbNames: ReadonlySet<string> = DB_NAMES_WITH_CAFFEINE,
  db: readonly CaffeineSourceRow[] = CAFFEINE_ITEMS_WITH_CAFFEINE
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
 * Build SectionList sections: while searching, a single "Results" section;
 * otherwise "Recent" (if any) plus one section per category (A–Z), excluding
 * recent items from category lists to avoid duplicates.
 */
export function buildCaffeinePickerSections(
  query: string,
  recentRows: readonly CaffeinePickerRow[],
  db: readonly CaffeineSourceRow[] = CAFFEINE_ITEMS_WITH_CAFFEINE
): CaffeinePickerSection[] {
  const q = query.trim().toLowerCase()
  const match = (row: CaffeineSourceRow) =>
    !q ||
    row.name.toLowerCase().includes(q) ||
    row.category.toLowerCase().includes(q)

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

  const recentSet = new Set(
    recentItems.map((r) =>
      isCustomRecentPickRow(r) ? r.recentKey : r.name
    )
  )
  const byCat = new Map<string, CaffeineSourceRow[]>()
  for (const row of db) {
    if (!match(row)) continue
    if (recentSet.has(row.name)) continue
    const list = byCat.get(row.category)
    if (list) list.push(row)
    else byCat.set(row.category, [row])
  }

  const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b))
  for (const cat of cats) {
    const data = (byCat.get(cat) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    if (data.length > 0) {
      sections.push({ title: cat, key: cat, data })
    }
  }

  return sections
}
