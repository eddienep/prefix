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
