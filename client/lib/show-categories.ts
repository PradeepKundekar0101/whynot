/**
 * Whatnot-style category & tag taxonomy used by the Schedule a Show form.
 * Two levels: top categories → subcategories. Each subcategory has its own tag suggestions.
 */

export interface Subcategory {
  slug: string;
  label: string;
  tags?: string[];
}

export interface TopCategory {
  slug: string;
  label: string;
  children: Subcategory[];
}

const STANDARD_CARD_TAGS = [
  "Hobby",
  "Raw Cards",
  "Repacks",
  "Retail",
  "Slabs",
  "Sealed Product",
  "Vintage",
  "Modern",
];

export const SHOW_CATEGORIES: TopCategory[] = [
  {
    slug: "trading_card_games",
    label: "Trading Card Games",
    children: [
      { slug: "pokemon", label: "Pokémon", tags: STANDARD_CARD_TAGS },
      { slug: "one_piece", label: "One Piece", tags: STANDARD_CARD_TAGS },
      { slug: "magic_the_gathering", label: "Magic: The Gathering", tags: STANDARD_CARD_TAGS },
      { slug: "yugioh", label: "Yu-Gi-Oh!", tags: STANDARD_CARD_TAGS },
      { slug: "lorcana", label: "Lorcana", tags: STANDARD_CARD_TAGS },
    ],
  },
  {
    slug: "sports_cards",
    label: "Sports Cards",
    children: [
      { slug: "football", label: "Football Cards", tags: STANDARD_CARD_TAGS },
      { slug: "basketball", label: "Basketball Cards", tags: STANDARD_CARD_TAGS },
      { slug: "baseball", label: "Baseball Cards", tags: STANDARD_CARD_TAGS },
      { slug: "soccer", label: "Soccer Cards", tags: STANDARD_CARD_TAGS },
      { slug: "ufc", label: "UFC Cards", tags: STANDARD_CARD_TAGS },
      { slug: "hockey", label: "Hockey Cards", tags: STANDARD_CARD_TAGS },
      { slug: "wrestling", label: "Wrestling Cards", tags: STANDARD_CARD_TAGS },
    ],
  },
  {
    slug: "sneakers",
    label: "Sneakers",
    children: [
      { slug: "jordan", label: "Jordan", tags: ["Retro", "OG", "Sample", "Limited", "Deadstock"] },
      { slug: "nike", label: "Nike", tags: ["Dunk", "Air Force", "Air Max", "SB", "Limited"] },
      { slug: "adidas", label: "Adidas", tags: ["Yeezy", "Samba", "Gazelle", "Limited"] },
      { slug: "new_balance", label: "New Balance", tags: ["Made in USA", "Made in UK", "990", "550"] },
    ],
  },
  {
    slug: "comics",
    label: "Comics & Manga",
    children: [
      { slug: "marvel", label: "Marvel", tags: ["Key Issue", "Modern", "Bronze Age", "Silver Age", "Slabs"] },
      { slug: "dc", label: "DC", tags: ["Key Issue", "Modern", "Bronze Age", "Silver Age", "Slabs"] },
      { slug: "manga", label: "Manga", tags: ["Shonen", "Seinen", "Vintage", "Sealed"] },
      { slug: "indie", label: "Indie & Variants", tags: ["Image", "Dark Horse", "Variants", "Signed"] },
    ],
  },
  {
    slug: "electronics",
    label: "Electronics",
    children: [
      { slug: "phones", label: "Phones", tags: ["Apple", "Samsung", "Refurbished", "Unlocked"] },
      { slug: "consoles", label: "Gaming Consoles", tags: ["Nintendo", "PlayStation", "Xbox", "Retro", "Sealed"] },
      { slug: "audio", label: "Audio Gear", tags: ["Headphones", "Speakers", "Vintage", "Hi-Fi"] },
      { slug: "computers", label: "Computers", tags: ["Apple", "PC", "Gaming", "Refurbished"] },
    ],
  },
  {
    slug: "funko",
    label: "Funko & Collectibles",
    children: [
      { slug: "pop_vinyl", label: "Pop! Vinyl", tags: ["Exclusive", "Chase", "Vaulted", "Convention"] },
      { slug: "plush", label: "Plush", tags: ["Anime", "Disney", "Limited"] },
      { slug: "statues", label: "Statues & Figures", tags: ["Hot Toys", "Sideshow", "Iron Studios"] },
    ],
  },
  {
    slug: "vintage_antiques",
    label: "Vintage & Antiques",
    children: [
      { slug: "watches", label: "Watches", tags: ["Vintage", "Luxury", "Mechanical", "Quartz"] },
      { slug: "jewelry", label: "Jewelry", tags: ["Gold", "Silver", "Antique", "Estate"] },
      { slug: "coins_currency", label: "Coins & Currency", tags: ["Graded", "Raw", "Silver", "Gold"] },
    ],
  },
];

export function findCategory(slug: string): TopCategory | undefined {
  return SHOW_CATEGORIES.find((c) => c.slug === slug);
}

export function findSubcategory(
  categorySlug: string,
  subcategorySlug: string | undefined
): Subcategory | undefined {
  if (!subcategorySlug) return undefined;
  return findCategory(categorySlug)?.children.find((s) => s.slug === subcategorySlug);
}

export function tagsFor(categorySlug: string, subcategorySlug?: string): string[] {
  const sub = findSubcategory(categorySlug, subcategorySlug);
  if (sub?.tags?.length) return sub.tags;
  // Fallback: union of all subcategory tags for the top category
  const cat = findCategory(categorySlug);
  if (!cat) return [];
  const set = new Set<string>();
  for (const child of cat.children) for (const t of child.tags ?? []) set.add(t);
  return Array.from(set);
}
