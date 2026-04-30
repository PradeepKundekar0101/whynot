export interface SpotUser {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface Spot {
  id: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  description: string | null;
  startingPrice: number; // cents
  assignedName: string | null;

  auctionStatus: "pending" | "active" | "ended" | "skipped";
  auctionStartedAt: string | null;
  auctionEndsAt: string | null;
  startingBid: number | null;
  currentBid: number | null;
  bidCount: number;
  highBidderId: string | null;
  highBidder: SpotUser | null;

  suddenDeath: boolean;
  counterBidTime: number;
  initialDuration: number;

  winnerId: string | null;
  winner: SpotUser | null;
  soldPrice: number | null;
  soldAt: string | null;

  spinPlayedAt: string | null;

  // Reveal mode
  revealStatus: "pending" | "revealing" | "revealed" | "skipped";
  revealText: string | null;
  revealedAt: string | null;
  revealOrder: number | null;
  isPinned: boolean;

  createdAt: string;
}

export interface Break {
  id: string;
  streamId: string;
  type: "break";
  breakName: string;
  breakDescription: string | null;
  sellingMode: "auction" | "buy_it_now";
  breakFormat: "pick_your" | "random";
  spotPreset: string | null;
  shippingProfile: string;
  status: "filling" | "breaking" | "randomizing" | "revealing" | "completed" | "cancelled";
  startedAt: string | null;
  randomizationCompletedAt: string | null;
  revealStartedAt: string | null;
  completedAt: string | null;
  currentRevealingSpotId: string | null;
  autoRandomize: boolean;
  quickSpin: boolean;
  createdAt: string;
  spots: Spot[];
}

export interface SpotAuctionStartedEvent {
  spotId: string;
  listingId: string;
  startingBid: number;
  endsAt: string;
  counterBidTime: number;
  suddenDeath: boolean;
  initialDuration: number;
  spotName: string;
  spotNumber: number;
}

export interface SpotBidPlacedEvent {
  spotId: string;
  listingId: string;
  amount: number;
  bidderId: string;
  bidderUsername: string;
  bidderAvatarUrl: string | null;
  newEndsAt: string;
  bidCount: number;
}

export interface SpotAuctionEndedEvent {
  spotId: string;
  listingId: string;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerAvatarUrl?: string | null;
  soldPrice: number;
}

export interface SpotPurchasedEvent {
  spotId: string;
  listingId: string;
  buyerId: string;
  buyerUsername: string;
  buyerAvatarUrl: string | null;
  soldPrice: number;
}

export interface SpotSpinStartedEvent {
  spotId: string;
  candidateNames: string[];
  quickSpin: boolean;
}

export interface SpotSpinCompletedEvent {
  spotId: string;
  assignedName: string;
  winnerId: string | null;
  winnerUsername: string | null;
}

export interface SpotAssignedEvent {
  spotId: string;
  assignedName: string;
  winnerId: string | null;
  winnerUsername: string | null;
}

// ── Reveal mode events ──────────────────────────────────────────────

export interface BreakRandomizingEvent {
  listingId: string;
}

export interface BreakRevealingStartedEvent {
  listingId: string;
  assignments: Array<{
    spotId: string;
    spotNumber: number;
    winnerId: string | null;
    winnerUsername: string | null;
  }>;
}

export interface SpotRevealStartedEvent {
  spotId: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerAvatarUrl: string | null;
}

export interface SpotRevealedEvent {
  spotId: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  revealText: string;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerAvatarUrl: string | null;
  revealOrder: number;
  isEdit: boolean;
  isRebroadcast?: boolean;
}

export interface SpotRevealSkippedEvent {
  spotId: string;
  listingId: string;
}

export interface SpotReorderEvent {
  listingId: string;
  spotId: string;
  isPinned: boolean;
}

export interface BreakCompletedEvent {
  listingId: string;
  orderIds: string[];
}

export type AckResponse =
  | { ok: true }
  | ({ ok: false; error: string; message?: string } & Record<string, unknown>);
