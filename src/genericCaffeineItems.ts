const G = 'Generic'

type GenericRow = {
  name: string
  oz: number
  mg: number
  image_url: string
  category: string
  listEmoji: string
}

/**
 * Typical servings for quick logging. Names kept distinct from the main CSV catalog.
 * `image_url` empty → `listEmoji` in the picker; no remote image.
 */
export const GENERIC_CAFFEINE_ITEMS: GenericRow[] = [
  { name: 'Brewed coffee (8 fl oz)', oz: 8, mg: 95, image_url: '', category: G, listEmoji: '☕' },
  { name: 'Brewed coffee (12 fl oz)', oz: 12, mg: 142, image_url: '', category: G, listEmoji: '☕' },
  { name: 'Espresso (single, ~1 fl oz)', oz: 1, mg: 64, image_url: '', category: G, listEmoji: '☕' },
  {
    name: 'Latte / cappuccino (12 fl oz, 1 shot)',
    oz: 12,
    mg: 75,
    image_url: '',
    category: G,
    listEmoji: '🥛',
  },
  { name: 'Cold brew (16 fl oz)', oz: 16, mg: 200, image_url: '', category: G, listEmoji: '🧊' },
  { name: 'Black tea (8 fl oz)', oz: 8, mg: 47, image_url: '', category: G, listEmoji: '🫖' },
  { name: 'Green tea (8 fl oz)', oz: 8, mg: 28, image_url: '', category: G, listEmoji: '🍃' },
  { name: 'Matcha latte (12 fl oz)', oz: 12, mg: 70, image_url: '', category: G, listEmoji: '🍵' },
  { name: 'Cola (12 fl oz can)', oz: 12, mg: 34, image_url: '', category: G, listEmoji: '🥤' },
  { name: 'Energy drink (8 fl oz)', oz: 8, mg: 80, image_url: '', category: G, listEmoji: '⚡' },
  { name: 'Energy shot (2 fl oz)', oz: 2, mg: 200, image_url: '', category: G, listEmoji: '🧪' },
  { name: 'Pre-workout drink (8 fl oz)', oz: 8, mg: 150, image_url: '', category: G, listEmoji: '💪' },
  { name: 'Milk tea / boba (16 fl oz)', oz: 16, mg: 50, image_url: '', category: G, listEmoji: '🧋' },
  { name: 'Dark chocolate (~1 oz)', oz: 1, mg: 20, image_url: '', category: G, listEmoji: '🍫' },
]
