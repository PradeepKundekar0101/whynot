export interface MockStream {
  id: string;
  sellerUsername: string;
  sellerAvatar: string;
  title: string;
  category: string;
  categorySlug: string;
  viewerCount: number;
  thumbnailUrl: string;
  isLive: boolean;
}

export interface MockCategory {
  name: string;
  slug: string;
  viewerCount: number;
}

export const mockStreams: MockStream[] = [
  {
    id: "1",
    sellerUsername: "CardKingMike",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Mike",
    title: "Opening Rare Pokemon Booster Boxes!",
    category: "Pokemon Cards",
    categorySlug: "pokemon-cards",
    viewerCount: 1243,
    thumbnailUrl: "https://picsum.photos/seed/stream1/400/600",
    isLive: true,
  },
  {
    id: "2",
    sellerUsername: "SneakerVault",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Sneaker",
    title: "Jordan 4 Retro + Yeezy Drops",
    category: "Sneakers",
    categorySlug: "sneakers",
    viewerCount: 892,
    thumbnailUrl: "https://picsum.photos/seed/stream2/400/600",
    isLive: true,
  },
  {
    id: "3",
    sellerUsername: "ToppsCollector",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Topps",
    title: "Baseball Card Breaks - Bowman 2026",
    category: "Sports Cards",
    categorySlug: "sports-cards",
    viewerCount: 567,
    thumbnailUrl: "https://picsum.photos/seed/stream3/400/600",
    isLive: true,
  },
  {
    id: "4",
    sellerUsername: "TechDealsDaily",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Tech",
    title: "GPU & Console Auctions Starting at $1",
    category: "Electronics",
    categorySlug: "electronics",
    viewerCount: 2105,
    thumbnailUrl: "https://picsum.photos/seed/stream4/400/600",
    isLive: true,
  },
  {
    id: "5",
    sellerUsername: "FunkoPalace",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Funko",
    title: "Exclusive Funko Pops - Chase Hunt!",
    category: "Funko",
    categorySlug: "funko",
    viewerCount: 341,
    thumbnailUrl: "https://picsum.photos/seed/stream5/400/600",
    isLive: true,
  },
  {
    id: "6",
    sellerUsername: "VintageFinds",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Vintage",
    title: "Antique Jewelry & Watch Auction",
    category: "Vintage & Antiques",
    categorySlug: "vintage-antiques",
    viewerCount: 189,
    thumbnailUrl: "https://picsum.photos/seed/stream6/400/600",
    isLive: true,
  },
  {
    id: "7",
    sellerUsername: "TCGMaster",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=TCG",
    title: "Yu-Gi-Oh! Rarity Collection Breaks",
    category: "Trading Card Games",
    categorySlug: "trading-card-games",
    viewerCount: 723,
    thumbnailUrl: "https://picsum.photos/seed/stream7/400/600",
    isLive: true,
  },
  {
    id: "8",
    sellerUsername: "ComicBookGuru",
    sellerAvatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Comic",
    title: "Graded Comics - CGC 9.8 Auctions",
    category: "Comics",
    categorySlug: "comics",
    viewerCount: 456,
    thumbnailUrl: "https://picsum.photos/seed/stream8/400/600",
    isLive: true,
  },
];

export const mockCategories: MockCategory[] = [
  { name: "Electronics", slug: "electronics", viewerCount: 5420 },
  { name: "Trading Card Games", slug: "trading-card-games", viewerCount: 8932 },
  { name: "Pokemon Cards", slug: "pokemon-cards", viewerCount: 12450 },
  { name: "Sports Cards", slug: "sports-cards", viewerCount: 6234 },
  { name: "Sneakers", slug: "sneakers", viewerCount: 3891 },
  { name: "Funko", slug: "funko", viewerCount: 2145 },
  { name: "Vintage & Antiques", slug: "vintage-antiques", viewerCount: 1567 },
  { name: "Comics", slug: "comics", viewerCount: 1823 },
];

export const sidebarCategories = [
  "For You",
  "Electronics",
  "Trading Card Games",
  "Pokemon Cards",
  "Sports Cards",
  "Sneakers",
  "Funko",
  "Vintage & Antiques",
  "Comics",
];
