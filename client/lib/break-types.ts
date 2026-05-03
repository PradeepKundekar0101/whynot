export type SpotType = "team" | "character" | "pack" | "hit" | "slot";
export type AssignmentMode =
  | "pick_your"
  | "pre_assigned"
  | "random_per_spot"
  | "random_at_end";

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
   * The team/character/pack behind this spot — surfaced by the API only when:
   *   - the caller is the seller, OR
   *   - the caller is the winner of this spot, OR
   *   - the spot has been publicly revealed (isRevealedToBuyers=true).
   * Null otherwise.
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

  spotType: SpotType;
  assignmentMode: AssignmentMode;
  /**
   * Source pool the assignment engine draws from. The server zeroes this for
   * non-seller buyers on in-progress non-pick_your breaks so peeking can't
   * leak unrevealed assignments.
   */
  spotPool: string[];
  spotPreset: string | null;
  consolationPrize: string | null;

  shippingProfile: string;
  status: "filling" | "breaking" | "completed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;

  /** When true, reveal auto-fires after each win (delayed by quickSpin duration). */
  autoRandomize: boolean;
  /** true = 3 s spin animation; false = 6 s. Independent of autoRandomize. */
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
 * Drives the top-of-video "X won the auction!" toast and tells the client
 * what reveal flow to expect next.
 */
export interface SpotWonEvent {
  spotId: string;
  listingId: string;
  spotNumber: number;
  winnerId: string;
  winnerUsername: string;
  winnerAvatarUrl: string | null;
  soldPrice: number;
  /** Listing's assignment mode — drives what happens after the win toast. */
  assignmentMode: AssignmentMode;
  /** When false, the client should show "Awaiting spin" until spot:spin_started lands. */
  autoRandomize: boolean;
  /** Quick spin = 3 s animation; false = 6 s. */
  quickSpin: boolean;
}

/**
 * Fires when the spin starts (either automatically after the win delay or
 * manually via "Spin Now"). Carries the candidates list so the client can
 * animate a wheel through them; the server is the source of truth for the
 * actual landing — sent later in spot:revealed.
 */
export interface SpotSpinStartedEvent {
  spotId: string;
  listingId: string;
  spotNumber: number;
  candidates: string[];
  durationMs: number;
}

/**
 * Fires after the spin lands — the team is now public.
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

/**
 * Final batch reveal for assignmentMode='random_at_end' breaks. Fires once
 * after the last auction ends; lists every winner + their assigned team in
 * one event so the client can run a celebratory group reveal animation.
 */
export interface BreakFinalRevealEvent {
  listingId: string;
  breakName: string;
  assignments: Array<{
    spotId: string;
    spotNumber: number;
    winnerId: string | null;
    winnerUsername: string | null;
    revealedTeam: string;
  }>;
}

export interface BreakCompletedEvent {
  listingId: string;
  orderIds: string[];
}

export type AckResponse =
  | { ok: true }
  | ({ ok: false; error: string; message?: string } & Record<string, unknown>);

// ── Spot-type display copy ────────────────────────────────────────────────

export const SPOT_TYPE_COPY: Record<
  SpotType,
  { singular: string; plural: string; pickVerb: string; awaiting: string }
> = {
  team: {
    singular: "team",
    plural: "teams",
    pickVerb: "Pick a Team",
    awaiting: "Your team is coming up…",
  },
  character: {
    singular: "character",
    plural: "characters",
    pickVerb: "Pick a Character",
    awaiting: "Your character is coming up…",
  },
  pack: {
    singular: "pack",
    plural: "packs",
    pickVerb: "Pick a Pack",
    awaiting: "Your pack is coming up…",
  },
  hit: {
    singular: "hit",
    plural: "hits",
    pickVerb: "Pick a Hit",
    awaiting: "Your hit is coming up…",
  },
  slot: {
    singular: "spot",
    plural: "spots",
    pickVerb: "Pick a Spot",
    awaiting: "Your reveal is coming up…",
  },
};

export function spotTypeCopy(type: SpotType | string): {
  singular: string;
  plural: string;
  pickVerb: string;
  awaiting: string;
} {
  return SPOT_TYPE_COPY[(type as SpotType)] ?? SPOT_TYPE_COPY.slot;
}
