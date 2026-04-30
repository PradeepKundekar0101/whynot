# Phase 1: Foundation — Auth + Database + Home Page UI

## Overview

Set up the Express backend with Prisma/PostgreSQL, implement JWT auth, and build the Whatnot-style home page with mock data. This is the foundation all other phases build on.

## Decisions

- **No Turborepo.** Keep flat `client/` + `server/` structure.
- **Express backend from day one.** No temporary Next.js API routes.
- **Full Prisma schema now.** All models created upfront to avoid migration churn. Phase 1 only uses User and Follow.
- **Mock stream data.** Home page renders with hardcoded data since streaming isn't built yet.

---

## 1. Server Setup

### Structure

```
server/
  src/
    index.ts              # Express app entry, middleware, route mounting
    routes/
      auth.ts             # auth route handlers
    services/
      auth.service.ts     # signup, login, token refresh logic
    middleware/
      authenticate.ts     # JWT verification middleware
    lib/
      prisma.ts           # Prisma client singleton
      jwt.ts              # sign/verify token helpers
    types/
      index.ts            # JWT payload, request types
  prisma/
    schema.prisma
  package.json
  tsconfig.json
  .env
```

### Dependencies

- `express`, `cors`, `helmet`, `cookie-parser` — HTTP framework + security
- `@prisma/client`, `prisma` — ORM
- `bcrypt` — password hashing (12 salt rounds)
- `jsonwebtoken` — JWT signing/verification
- `zod` — input validation
- `dotenv` — environment config
- `tsx` — TypeScript execution for dev
- Types: `@types/express`, `@types/bcrypt`, `@types/jsonwebtoken`, `@types/cookie-parser`, `@types/cors`

### Environment Variables

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatnot
JWT_ACCESS_SECRET=<random-secret>
JWT_REFRESH_SECRET=<different-random-secret>
CLIENT_URL=http://localhost:3000
PORT=3001
```

### Express Configuration

- CORS: allow `CLIENT_URL`, credentials: true
- Helmet: default security headers
- cookie-parser: for reading refresh token cookie
- JSON body parser: 10kb limit
- All routes prefixed under `/api`

---

## 2. Prisma Schema

Use the exact schema from the spec. All models created now:

- **User** — id, email, username, passwordHash, displayName, avatarUrl, bio, isSellerEnabled, sellerRating, walletBalance, stripeCustomerId, timestamps
- **Stream** — id, sellerId, title, thumbnailUrl, category, status, livekitRoomName, viewerCount, timestamps
- **Listing** — id, streamId, type (auction/break/fixed_price/giveaway), title, description, imageUrl, auction fields, break fields, fixed price fields, status, timestamps
- **Bid** — id, listingId, bidderId, amount, timestamp
- **SpotReservation** — id, listingId, userId, status, spotNumber, heldUntil, timestamp. Unique constraint on [listingId, userId, status]
- **WalletTransaction** — id, userId, type, amountCents, balanceAfter, description, stripePaymentIntentId, metadata (JSON), timestamp
- **ChatMessage** — id, streamId, userId, text, timestamp
- **Follow** — composite PK [followerId, followedId], timestamp

PostgreSQL as the database. Run initial migration after schema creation.

---

## 3. Auth Endpoints

### POST `/api/auth/signup`

**Input (Zod validated):**
- `email` — valid email format, unique
- `username` — alphanumeric + underscore, 3-20 chars, unique
- `password` — minimum 8 characters
- `displayName` — required, 1-50 chars

**Flow:**
1. Validate input with Zod
2. Check email and username uniqueness (Prisma will also enforce at DB level)
3. Hash password with bcrypt (12 rounds)
4. Create User record
5. Generate access token (15 min) and refresh token (7 days)
6. Set refresh token as httpOnly, secure, sameSite=lax cookie
7. Return `{ user: UserResponse, accessToken: string }`

### POST `/api/auth/login`

**Input:** `email`, `password`

**Flow:**
1. Find user by email
2. Compare password with bcrypt
3. If invalid, return 401 with generic "Invalid credentials" (don't reveal which field is wrong)
4. Generate tokens, set cookie, return user + access token

### POST `/api/auth/refresh`

**Input:** Refresh token from httpOnly cookie

**Flow:**
1. Read `refreshToken` cookie
2. Verify JWT signature and expiry
3. Find user by token's userId
4. Generate new access token
5. Return `{ accessToken: string }`

### GET `/api/auth/me`

**Auth required** (authenticate middleware)

**Flow:**
1. Middleware extracts Bearer token from Authorization header
2. Verify access token
3. Find user by userId from token
4. Return user profile (exclude passwordHash)

### POST `/api/auth/logout`

**Flow:**
1. Clear the refresh token cookie
2. Return 200

### JWT Payload

```typescript
interface JwtPayload {
  userId: string;
  email: string;
}
```

Access token signed with `JWT_ACCESS_SECRET`, 15 min expiry.
Refresh token signed with `JWT_REFRESH_SECRET`, 7 day expiry.

### Error Responses

Standard format:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [{ "field": "email", "message": "Email already in use" }]
  }
}
```

---

## 4. Frontend

### Structure

```
client/
  app/
    layout.tsx              # Root layout — Inter font, auth provider
    page.tsx                # Home page
    (auth)/
      login/page.tsx
      signup/page.tsx
  components/
    layout/
      Navbar.tsx            # Top bar: logo, search, nav, profile
      Sidebar.tsx           # Left sidebar: greeting, category nav
      Footer.tsx            # Blog, Careers, About, FAQ, etc.
    stream/
      StreamCard.tsx        # Live stream card for home feed
      CategoryTile.tsx      # Yellow category tile with name + viewer count
  lib/
    api.ts                  # Fetch wrapper for backend calls
    auth-context.tsx        # AuthContext provider (user state, login/logout/signup)
    mock-data.ts            # Hardcoded stream and category data
  hooks/
    useAuth.ts              # Convenience hook for useContext(AuthContext)
```

### Dependencies to Add

- `shadcn/ui` — component library (Button, Input, Card, Dialog, Avatar, etc.)
- Theme customization: yellow primary (`#FFD600`), `rounded-xl` default radius, Inter font

### Home Page Layout (Logged-in View)

**Top bar (Navbar):**
- Left: "Whatnot" logo text
- Center: `Home` | `Browse` tabs, large search bar
- Right: `Become a Seller` button, heart/message/notification/gift icons, profile avatar dropdown

**Left sidebar (Sidebar):**
- `Hello {username}!` greeting
- Category links: For You, Electronics, Trading Card Games, Pokemon Cards, Sports Cards, Sneakers, Funko, Vintage & Antiques

**Main content:**
- "Live Now" section: horizontal scrolling row of `StreamCard` components
- "Categories You Might Like": row of `CategoryTile` components (yellow/mustard rounded tiles)
- "Recommended in Electronics" (etc.) sections with more stream cards

**Footer:**
- Links: Blog, Careers, About Us, FAQ, Privacy, Terms, Contact
- Language selector

### StreamCard Component

- Thumbnail image (placeholder)
- Red "Live" pill with viewer count
- Seller username with badge
- Stream title
- Category tags

### Auth Pages

- Centered card layout
- Email, username (signup only), password, display name (signup only) fields
- Yellow "Sign Up" / "Log In" CTA button
- Link to toggle between login/signup
- Form submits to backend, stores access token in memory (not localStorage), sets refresh cookie via API

### Auth State Management

- `AuthContext` holds: `user`, `accessToken`, `isLoading`, `login()`, `signup()`, `logout()`, `refreshToken()`
- On app load: attempt token refresh. If it succeeds, user is logged in. If it fails, user is logged out.
- Access token stored in React state (memory only, not persisted to storage)
- Automatic token refresh before expiry using `setTimeout`

### API Client (`lib/api.ts`)

- Wraps `fetch` with base URL pointing to `http://localhost:3001/api`
- Automatically attaches `Authorization: Bearer <token>` header
- Handles 401 responses by attempting token refresh, then retrying
- `credentials: 'include'` for cookie-based refresh token

---

## 5. Mock Data

File: `lib/mock-data.ts`

Hardcoded arrays for:
- **streams**: 8-10 items with id, sellerUsername, sellerAvatar, title, category, viewerCount, thumbnailUrl (placeholder images), isLive
- **categories**: Electronics, Trading Card Games, Pokemon Cards, Sports Cards, Sneakers, Funko, Vintage & Antiques, Comics — each with name, slug, viewerCount, icon/color

No API calls for stream discovery in Phase 1. The home page imports and renders this static data directly.

---

## 6. Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL running locally (or via Docker)
- pnpm or npm

### Running Locally

```bash
# Terminal 1: Start server
cd server && npm run dev    # tsx watch src/index.ts

# Terminal 2: Start client
cd client && npm run dev    # next dev
```

Server runs on port 3001, client on port 3000.

### Database

```bash
cd server
npx prisma migrate dev --name init
npx prisma generate
```
