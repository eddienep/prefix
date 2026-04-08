const G = 'Generic'

type GenericRow = {
  name: string
  oz: number
  mg: number
  image_url: string
  category: string
}

/**
 * Typical servings for quick logging. Names kept distinct from the main CSV catalog.
 * `image_url` empty → list uses the default drink emoji.
 */
export const GENERIC_CAFFEINE_ITEMS: GenericRow[] = [
  { name: 'Brewed coffee (8 fl oz)', oz: 8, mg: 95, image_url: '', category: G },
  { name: 'Brewed coffee (12 fl oz)', oz: 12, mg: 142, image_url: '', category: G },
  { name: 'Espresso (single, ~1 fl oz)', oz: 1, mg: 64, image_url: '', category: G },
  {
    name: 'Latte / cappuccino (12 fl oz, 1 shot)',
    oz: 12,
    mg: 75,
    image_url: '',
    category: G,
  },
  { name: 'Cold brew (16 fl oz)', oz: 16, mg: 200, image_url: '', category: G },
  { name: 'Black tea (8 fl oz)', oz: 8, mg: 47, image_url: '', category: G },
  { name: 'Green tea (8 fl oz)', oz: 8, mg: 28, image_url: '', category: G },
  { name: 'Matcha latte (12 fl oz)', oz: 12, mg: 70, image_url: '', category: G },
  { name: 'Cola (12 fl oz can)', oz: 12, mg: 34, image_url: '', category: G },
  { name: 'Energy drink (8 fl oz)', oz: 8, mg: 80, image_url: '', category: G },
  { name: 'Energy shot (2 fl oz)', oz: 2, mg: 200, image_url: '', category: G },
  { name: 'Pre-workout drink (8 fl oz)', oz: 8, mg: 150, image_url: '', category: G },
  { name: 'Milk tea / boba (16 fl oz)', oz: 16, mg: 50, image_url: '', category: G },
  { name: 'Dark chocolate (~1 oz)', oz: 1, mg: 20, image_url: '', category: G },
]
