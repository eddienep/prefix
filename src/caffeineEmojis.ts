/** Curated picks for custom log entries (single codepoints / common sequences). */
export const CAFFEINE_ENTRY_EMOJI_OPTIONS: readonly {
  emoji: string
  label: string
}[] = [
  { emoji: '☕', label: 'Coffee' },
  { emoji: '🍵', label: 'Tea' },
  { emoji: '🧋', label: 'Bubble tea' },
  { emoji: '🫖', label: 'Teapot' },
  { emoji: '🥤', label: 'Soft drink' },
  { emoji: '⚡', label: 'Energy' },
  { emoji: '🍫', label: 'Chocolate' },
  { emoji: '🥛', label: 'Latte / milk' },
  { emoji: '🧊', label: 'Iced' },
  { emoji: '🫘', label: 'Coffee beans' },
  { emoji: '🌿', label: 'Herbal / matcha' },
  { emoji: '🍃', label: 'Green tea' },
] as const

export const DEFAULT_ENTRY_EMOJI = '☕'
