# Build a Live Auction Commerce Platform (Whatnot Clone)

## Project Overview

Build a production-grade, end-to-end live shopping and auction platform that replicates Whatnot's core experience. Users can act as both **buyers** and **sellers** — sellers go live with video streams and run auctions, breaks, giveaways, and fixed-price sales; buyers watch, chat, bid, and buy in real time.

---

## Tech Stack (Strict)

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Node.js + Express + TypeScript
- **Real-time:** WebSocket (use `ws` or Socket.IO — pick Socket.IO for room management)
- **Live Video:** LiveKit (self-hosted or cloud) for WebRTC streaming
- **Database:** PostgreSQL (use Prisma ORM)
- **Cache + Pub/Sub:** Redis (for rate limiting, atomic counters, WebSocket fan-out)
- **Payments:** Stripe — implement a **wallet/top-up model** (users pre-fund their balance, then spend from it; no per-transaction Stripe charge during bidding)
- **Auth:** JWT (access + refresh tokens), bcrypt for password hashing
- **File Storage:** S3-compatible (DigitalOcean Spaces or AWS S3) for thumbnails, product images, profile pics
- **Deployment:** Docker Compose for local dev; production on a single DO droplet to start

---

## UI Reference (CRITICAL)

The UI **must visually match Whatnot exactly**. Key reference points:

### Home Page (Logged-in)

- Top bar: Whatnot logo (left), `Home` / `Browse` tabs, large search bar (center), `Become a Seller` CTA, icons for likes/messages/notifications/gifts, profile avatar (right)
- Left sidebar: `Hello {username}!` greeting, category nav (`For You`, `Electronics`, `Trading Card Games`, `Pokémon Cards`, `Sports Cards`, etc.)
- Main area: Horizontal scrolling row of **live stream cards** — each card shows thumbnail (auto-playing video preview on hover), `Live · {viewer_count}` red pill, seller username with badge icon, stream title, category tags
- "Categories You Might Like" row: yellow/mustard rounded tiles with category name + viewer count
- "Recommended in {Category}" sections below
- Footer: Blog, Careers, About Us, FAQ, Privacy, Terms, Contact, language selector

### Live Stream Page (the main money-maker UI)

- **3-column layout:**
  - **Left (320px):** Shop panel — search shop, Filter/Sort/Auction/Giveaway/Sold tabs, list of "Breaks" / "Auctions" with progress bars showing fill status, "See Spots" buttons
  - **Center:** Vertical 9:16 video stream with seller's webcam, current item overlay, confetti animations on wins, mute/chat/share/payment icons on right edge of video, current item title + progress bar at bottom (`177 of 299 remaining`), large yellow `View spots` CTA button
  - **Right (380px):** `Giveaway with N entries` collapsible header, `Chat` / `Watching` tabs, scrolling chat messages with avatars, `Say something...` input at bottom
- Color scheme: white background, **Whatnot yellow** (`#FFEB3B`-ish, more like `#FFD600`) for primary CTAs, black text, red live indicators

### Visual Style Requirements

- **Yellow primary CTAs** (Whatnot's signature)
- Rounded corners on cards (`rounded-xl`)
- Soft shadows, generous whitespace
- Inter or similar sans-serif font
- Live indicator pills are red with white text
- Profile avatars are circular with category badge (crown, shield, etc.) icon overlay

---

## Core Features (Build in This Order)

### Phase 1: Foundation

**1.1 Auth System**

- Email + password signup/login
- JWT access token (15 min) + refresh token (7 days, stored httpOnly)
- Password reset flow (email-based, use Resend or Postmark)
- User has dual role: every user is both buyer AND seller (no separate seller signup — they just toggle "Become a Seller" to unlock seller features after KYC-lite: legal name + address)
- Profile: username (unique), display name, avatar, bio, follower count, seller rating

**1.2 Database Schema (Prisma)**

```prisma
model User {
  id                String   @id @default(uuid())
  email             String   @unique
  username          String   @unique
  passwordHash      String
  displayName       String
  avatarUrl         String?
  bio               String?
  isSellerEnabled   Boolean  @default(false)
  sellerRating      Float    @default(5.0)
  walletBalance     Int      @default(0)  // in cents
  stripeCustomerId  String?
  createdAt         DateTime @default(now())

  streamsHosted     Stream[]
  bidsPlaced        Bid[]
  spotsPurchased    SpotReservation[]
  walletTxns        WalletTransaction[]
  followers         Follow[] @relation("Followed")
  following         Follow[] @relation("Follower")
}

model Stream {
  id              String   @id @default(uuid())
  sellerId        String
  seller          User     @relation(fields: [sellerId], references: [id])
  title           String
  thumbnailUrl    String?
  category        String   // "pokemon_cards", "sports_cards", etc.
  status          String   // "scheduled", "live", "ended"
  livekitRoomName String   @unique
  viewerCount     Int      @default(0)
  startedAt       DateTime?
  endedAt         DateTime?
  createdAt       DateTime @default(now())

  listings        Listing[]
  chatMessages    ChatMessage[]
}

model Listing {
  id              String   @id @default(uuid())
  streamId        String
  stream          Stream   @relation(fields: [streamId], references: [id])
  type            String   // "auction", "break", "fixed_price", "giveaway"
  title           String
  description     String?
  imageUrl        String?

  // Auction-specific
  startingBid     Int?     // cents
  currentBid      Int?
  bidIncrement    Int?
  highBidderId    String?
  endsAt          DateTime?

  // Break-specific
  totalSpots      Int?
  spotsSold       Int?     @default(0)
  pricePerSpot    Int?

  // Fixed price
  price           Int?
  inventory       Int?

  status          String   // "open", "closing", "sold", "cancelled"
  createdAt       DateTime @default(now())

  bids            Bid[]
  reservations    SpotReservation[]
}

model Bid {
  id          String   @id @default(uuid())
  listingId   String
  listing     Listing  @relation(fields: [listingId], references: [id])
  bidderId    String
  bidder      User     @relation(fields: [bidderId], references: [id])
  amount      Int      // cents
  createdAt   DateTime @default(now())
}

model SpotReservation {
  id              String    @id @default(uuid())
  listingId       String
  listing         Listing   @relation(fields: [listingId], references: [id])
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  status          String    // "held", "paid", "released"
  spotNumber      Int?      // assigned after randomization
  heldUntil       DateTime
  createdAt       DateTime  @default(now())

  @@unique([listingId, userId, status])
}

model WalletTransaction {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  type        String   // "topup", "purchase", "refund", "payout"
  amountCents Int      // positive = credit, negative = debit
  balanceAfter Int
  description String
  stripePaymentIntentId String?
  metadata    Json?
  createdAt   DateTime @default(now())
}

model ChatMessage {
  id        String   @id @default(uuid())
  streamId  String
  stream    Stream   @relation(fields: [streamId], references: [id])
  userId    String
  text      String
  createdAt DateTime @default(now())
}

model Follow {
  followerId String
  follower   User   @relation("Follower", fields: [followerId], references: [id])
  followedId String
  followed   User   @relation("Followed", fields: [followedId], references: [id])
  createdAt  DateTime @default(now())

  @@id([followerId, followedId])
}
```

### Phase 2: Wallet System

**2.1 Stripe Top-Up Flow**

- User clicks "Add funds" → modal with preset amounts ($25, $50, $100, $250, custom)
- Backend creates Stripe PaymentIntent with `automatic_payment_methods`
- Frontend uses Stripe Elements (or Payment Element) to collect card
- On `payment_intent.succeeded` webhook → credit `walletBalance`, write `WalletTransaction` row
- **Idempotency:** Maintain a `processed_stripe_events` table; on every webhook, check event ID first, skip if seen
- All wallet mutations happen inside Postgres transactions to keep balance and ledger consistent

**2.2 Spending from Wallet**

- All in-app purchases (bids, spots, fixed-price buys) deduct from `walletBalance`
- Use `SELECT ... FOR UPDATE` on user row when debiting
- Reject with clear error if insufficient funds → frontend prompts top-up modal
- Always write a `WalletTransaction` record with `balanceAfter` for full audit trail

### Phase 3: Live Streaming (LiveKit)

**3.1 Streaming Setup**

- Seller clicks "Go Live" → backend creates LiveKit room, generates publisher token, returns to frontend
- Seller's browser publishes video/audio via LiveKit JS SDK
- Viewer clicks stream → backend generates subscriber-only token, viewer joins room
- Track viewer count: increment on join, decrement on leave (use Redis `INCR`/`DECR`)
- Stream metadata (title, thumbnail) stored in Postgres; live state in Redis

**3.2 Stream Discovery**

- `GET /api/streams/live` → returns live streams sorted by viewer count
- `GET /api/streams/live?category=pokemon_cards` → filtered
- Cache hot queries in Redis with 5-second TTL (live data should be near-real-time but doesn't need millisecond freshness)

### Phase 4: Real-time Chat + Events (WebSocket)

**4.1 WebSocket Architecture**

- Single Socket.IO server, namespaced by stream: `/stream/:streamId`
- On join: client sends JWT, server validates, joins them to the room
- Events emitted to room:
  - `chat:message` — new chat message
  - `viewer:count` — updated viewer count (throttled to 1/sec)
  - `listing:new` — new auction/break/listing added
  - `listing:bid` — new bid placed
  - `listing:sold` — listing closed
  - `spot:purchased` — someone bought a spot in a break
  - `spot:assigned` — spots randomized, here's who got what
  - `confetti` — trigger celebration animation
- Use **Redis adapter** for Socket.IO so you can scale horizontally later

**4.2 Rate Limiting**

- Token bucket per user for chat: max 5 messages / 10 sec
- Token bucket per user for bid attempts: max 10 / sec
- Implement with `rate-limiter-flexible` package backed by Redis

### Phase 5: Auction Engine (THE HARD PART)

**5.1 Auction-Type Listings**

- Seller creates auction with starting bid, bid increment, duration (e.g., 30 sec)
- Each new bid resets the timer if it's placed in the last 10 sec (anti-snipe extension)
- Bid placement flow:

```
  1. Client emits `bid:place` via WS with { listingId, amount }
  2. Server validates:
     - User has sufficient wallet balance
     - Amount >= currentBid + bidIncrement
     - Listing still open
  3. BEGIN TX:
       - SELECT listing FOR UPDATE
       - SELECT user FOR UPDATE  (the bidder)
       - Refund previous high bidder's hold (if any) back to their wallet
       - Place hold on new bidder's wallet (debit their balance)
       - Update listing.currentBid, listing.highBidderId
       - Insert Bid record
     COMMIT
  4. Broadcast `listing:bid` to room
  5. If within 10s of end → extend endsAt by 10s, broadcast `listing:extended`
```

- When timer expires: cron-like worker closes listing, finalizes sale, deducts from winner's wallet, credits seller (minus platform fee)

**5.2 Break-Type Listings (Spot Sales)**

This is the critical flow. Use **Postgres row locking** for inventory.

```
Endpoint: POST /api/listings/:id/reserve-spot

BEGIN TX:
  SELECT * FROM listings WHERE id = $1 FOR UPDATE;
  -- Validate: status='open', spotsSold < totalSpots

  UPDATE listings
  SET spotsSold = spotsSold + 1
  WHERE id = $1 AND spotsSold < totalSpots;
  -- If 0 rows affected → return 409 SOLD_OUT

  SELECT * FROM users WHERE id = $userId FOR UPDATE;
  -- Validate: walletBalance >= pricePerSpot

  UPDATE users SET walletBalance = walletBalance - $price WHERE id = $userId;

  INSERT INTO spot_reservations (listing_id, user_id, status, held_until)
  VALUES ($1, $userId, 'paid', NOW() + INTERVAL '24 hours');

  INSERT INTO wallet_transactions (...);
COMMIT;

Broadcast `spot:purchased` event to stream room.
Update progress bar for all viewers in real-time.
```

When all spots sold → seller triggers "Randomize" → backend assigns spot numbers via cryptographically secure shuffle, broadcasts `spot:assigned` event with the assignments visible to all.

**5.3 Anti-Cheat / Trust**

- Spot randomization uses `crypto.randomBytes` seeded shuffle
- Publish a hash of the seed BEFORE assignment, reveal seed AFTER → provably fair
- Log all bid timestamps server-side; never trust client time

### Phase 6: Frontend Pages

**6.1 Routes (Next.js App Router)**

- `/` — home feed (logged-in: personalized; logged-out: marketing landing)
- `/login`, `/signup`, `/forgot-password`
- `/browse` — explore all live streams + categories
- `/category/:slug` — category page
- `/stream/:id` — live stream watch page (the 3-column UI)
- `/seller/dashboard` — seller's stream control panel (start stream, manage listings, see analytics)
- `/seller/go-live` — full-screen broadcaster UI with listing management sidebar
- `/profile/:username` — public profile
- `/settings` — account settings
- `/wallet` — balance, top-up, transaction history
- `/orders` — purchases (won auctions, bought spots, etc.)

**6.2 Component Library**

- Use shadcn/ui as base
- Customize theme: yellow primary, rounded-xl, Inter font
- Build these custom components:
  - `<StreamCard />` — for home feed
  - `<LiveStreamPlayer />` — wraps LiveKit
  - `<BreakCard />` — for left sidebar in stream page
  - `<ChatPanel />` — right sidebar in stream
  - `<BidButton />` — handles wallet check + bid placement
  - `<SpotProgressBar />` — animated, real-time
  - `<ConfettiOverlay />` — triggers on `confetti` WS event
  - `<WalletTopUpModal />`

### Phase 7: Production Concerns

**7.1 Observability**

- Structured logging with Pino
- Sentry for error tracking (frontend + backend)
- Basic metrics: streams live, active bidders, wallet topups/day

**7.2 Background Jobs (BullMQ on Redis)**

- `expire-holds` — every 10 sec: release expired spot holds, decrement spotsSold
- `close-auctions` — every second: close auctions whose `endsAt < now()`
- `payout-sellers` — daily: calculate seller earnings, mark for payout
- `cleanup-streams` — every 5 min: mark streams as ended if LiveKit room is empty for 60s

**7.3 Security**

- All inputs validated with Zod
- CORS locked to your frontend domain
- Helmet middleware
- Rate limit all auth endpoints aggressively (5 attempts / 15 min per IP)
- Stripe webhook signature verification (mandatory)
- Never expose `walletBalance` mutation endpoints to users — only via server-validated actions (bid, buy spot, etc.)

---

## Project Structure

```
/whatnot-clone
  /apps
    /web              # Next.js frontend
      /app
        /(marketing)
        /(authed)
          /stream/[id]
          /seller
        /api          # Next.js API routes (auth callbacks only)
      /components
      /lib
      /hooks
    /api              # Express backend
      /src
        /routes
        /services
        /workers
        /websocket
        /lib
        /middleware
      /prisma
        schema.prisma
  /packages
    /shared           # shared types between web + api
    /ui               # shared UI components
  docker-compose.yml
  turbo.json          # use Turborepo
```

---

## Development Workflow

1. **Bootstrap the monorepo** with Turborepo + pnpm workspaces
2. **Spin up local infra** with docker-compose: Postgres, Redis, LiveKit dev server
3. **Build Phase 1 (auth + DB) end-to-end** before moving on — this is your foundation
4. **Build Phase 2 (wallet) with thorough tests** — money bugs are the worst bugs
5. **Mock streaming first** with a static video before integrating LiveKit
6. **Add real-time + auctions last** — they're the hardest, you want everything else stable

---

## Acceptance Criteria

The MVP is "done" when:

- [ ] A user can sign up, top up wallet with Stripe, and see their balance
- [ ] A user can toggle seller mode and start a live stream (LiveKit working)
- [ ] Other users can discover the stream from the home page and join it
- [ ] The stream page renders with the exact 3-column Whatnot layout
- [ ] Chat works in real-time across all viewers
- [ ] Seller can create an auction listing; viewers can bid; high bidder wins; wallet is debited
- [ ] Seller can create a break; viewers race to buy spots; first N win; wallet debited atomically
- [ ] Spot randomization works and is broadcast to all viewers
- [ ] No race conditions: spamming "buy spot" with 100 concurrent users never oversells
- [ ] No double-charges: spamming "bid" never debits wallet twice for same bid
- [ ] All UI matches Whatnot's visual design (yellow CTAs, layout, fonts, spacing)

---

## Out of Scope (Don't Build Yet)

- Mobile native apps (web responsive only for now)
- Shipping label integration (manual for MVP — seller fulfills offline)
- Tax calculation
- Multi-currency
- Seller payout via Stripe Connect (just track owed amount in DB; manual payouts initially)
- Search (use Postgres full-text for now; add Algolia later)
- Recommendations engine (just sort by viewer count for now)
- Video recording/replay
- Mobile push notifications

---

## Start Here

Begin by:

1. Creating the monorepo structure
2. Writing the Prisma schema and running first migration
3. Building auth endpoints with full integration tests
4. Building the home page UI matching the Whatnot screenshot exactly (use placeholder data)
5. Then iterate through phases above

When in doubt, **prefer Postgres row locking over Redis tricks**. Build the simplest correct version first; optimize only after measuring.
