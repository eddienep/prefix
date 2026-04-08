import raw from './caffeineDatabase.json'

export type CaffeineSourceRow = {
  name: string
  oz: number
  mg: number
  image_url: string
  category: string
}

export type CaffeinePickerSection = {
  title: string
  key: string
  data: CaffeineSourceRow[]
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
  sourceProductName?: string
}

/**
 * Catalog product names for the picker “Recent” section, from **saved** consumption
 * only (newest first, deduped). Uses `sourceProductName` when set; otherwise falls
 * back to `label` only if it exactly matches a database product name.
 */
export function recentProductNamesFromEntries(
  entries: readonly EntryForRecentPick[],
  dbNames: ReadonlySet<string> = DB_NAMES_WITH_CAFFEINE
): string[] {
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const e of sorted) {
    const explicit = e.sourceProductName?.trim()
    const fromExplicit =
      explicit && dbNames.has(explicit) ? explicit : null
    const labelTrim = e.label.trim()
    const fromLabel = !fromExplicit && dbNames.has(labelTrim) ? labelTrim : null
    const key = fromExplicit ?? fromLabel
    if (!key || seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
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
  recentNames: readonly string[],
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

  const byName = new Map(db.map((r) => [r.name, r]))
  const recentItems: CaffeineSourceRow[] = []
  const seen = new Set<string>()
  for (const n of recentNames) {
    const r = byName.get(n)
    if (r && match(r) && !seen.has(r.name)) {
      recentItems.push(r)
      seen.add(r.name)
    }
  }

  const sections: CaffeinePickerSection[] = []
  if (recentItems.length > 0) {
    sections.push({ title: 'Recent', key: 'recent', data: recentItems })
  }

  const recentSet = new Set(recentItems.map((r) => r.name))
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
