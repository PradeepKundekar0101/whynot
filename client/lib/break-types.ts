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

  /**
   * The team behind this spot — surfaced by the API only when:
   *   - the caller is the seller, OR
   *   - the caller is the winner of this spot, OR
   *   - the spot has been publicly revealed (isRevealedToBuyers=true).
   * Null otherwise. Use this in UI; never reach into a hidden field.
   */
  revealedTeam: string | null;
  isRevealedToBuyers: boolean;
  revealedAt: string | null;

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
  status: "filling" | "breaking" | "completed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;
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

// ── Auto-reveal events ────────────────────────────────────────────────────

/**
 * Fires immediately when a spot is sold (auction ended OR buy-it-now).
 * Drives the top-of-video "X won the auction!" toast.
 */
export interface SpotWonEvent {
  spotId: string;
  listingId: string;
  spotNumber: number;
  winnerId: string;
  winnerUsername: string;
  winnerAvatarUrl: string | null;
  soldPrice: number;
}

/**
 * Fires ~3 seconds after spot:won — the team is now public.
 * Drives confetti + the "X's spot is ... Team Name" toast.
 */
export interface SpotRevealedEvent {
  spotId: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  revealedTeam: string;
  winnerId: string;
  winnerUsername: string;
  winnerAvatarUrl: string | null;
  revealedAt: string;
}

export interface BreakCompletedEvent {
  listingId: string;
  orderIds: string[];
}

export type AckResponse =
  | { ok: true }
  | ({ ok: false; error: string; message?: string } & Record<string, unknown>);
