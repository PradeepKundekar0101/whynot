# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Express backend with Prisma/PostgreSQL, implement JWT auth (signup/login/refresh/me/logout), and build a Whatnot-style home page with mock stream data.

**Architecture:** Flat `client/` + `server/` structure. Server is Express + TypeScript with Prisma ORM connecting to PostgreSQL. Client is Next.js 16 with Tailwind CSS 4 and shadcn/ui. Auth uses JWT access tokens (15 min, in-memory) + refresh tokens (7 days, httpOnly cookie). Home page renders mock data — no real streaming yet.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Express, TypeScript, Prisma, PostgreSQL, bcrypt, jsonwebtoken, Zod

---

## File Structure

### Server (all new)

```
server/
  src/
    index.ts                    # Express app: middleware, route mounting, listen
    routes/auth.ts              # Route handlers for /api/auth/*
    services/auth.service.ts    # Business logic: hash, compare, create user, generate tokens
    middleware/authenticate.ts  # JWT verification middleware for protected routes
    lib/prisma.ts               # Prisma client singleton
    lib/jwt.ts                  # signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken
  prisma/schema.prisma          # Full database schema
  package.json
  tsconfig.json
  .env.example
```

### Client (modify existing + new files)

```
client/
  app/
    layout.tsx                  # MODIFY: swap font to Inter, add AuthProvider wrapper
    page.tsx                    # MODIFY: replace with home page
    globals.css                 # MODIFY: update theme vars for Whatnot yellow
    (auth)/
      login/page.tsx            # NEW: login form
      signup/page.tsx           # NEW: signup form
  components/
    layout/Navbar.tsx           # NEW: top bar
    layout/Sidebar.tsx          # NEW: left sidebar with categories
    layout/Footer.tsx           # NEW: footer
    stream/StreamCard.tsx       # NEW: live stream card
    stream/CategoryTile.tsx     # NEW: yellow category tile
  lib/
    api.ts                      # NEW: fetch wrapper
    auth-context.tsx            # NEW: AuthContext + AuthProvider
    mock-data.ts                # NEW: hardcoded streams + categories
  hooks/useAuth.ts              # NEW: convenience hook
```

---

## Task 1: Server project setup

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/src/index.ts`
- Create: `server/src/lib/prisma.ts`

- [ ] **Step 1: Initialize server package.json**

```bash
cd server
npm init -y
```

Then replace `server/package.json` with:

```json
{
  "name": "whatnot-server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd server
npm install express cors helmet cookie-parser @prisma/client zod bcrypt jsonwebtoken dotenv
npm install -D typescript tsx prisma @types/express @types/cors @types/cookie-parser @types/bcrypt @types/jsonwebtoken @types/node
```

- [ ] **Step 3: Create tsconfig.json**

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create .env.example**

Create `server/.env.example`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatnot
JWT_ACCESS_SECRET=change-me-access-secret-at-least-32-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-at-least-32-chars
CLIENT_URL=http://localhost:3000
PORT=3001
```

- [ ] **Step 5: Create Prisma client singleton**

Create `server/src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default prisma;
```

- [ ] **Step 6: Create Express app entry**

Create `server/src/index.ts`:

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 7: Verify server starts**

```bash
cd server
cp .env.example .env
npx tsx src/index.ts
```

Expected: `Server running on port 3001`. Hit `http://localhost:3001/api/health` and get `{"status":"ok"}`. Kill the process after verifying.

- [ ] **Step 8: Commit**

```bash
git add server/
git commit -m "feat: scaffold Express server with TypeScript"
```

---

## Task 2: Prisma schema and database migration

**Files:**
- Create: `server/prisma/schema.prisma`

- [ ] **Step 1: Create Prisma schema**

Create `server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id               String   @id @default(uuid())
  email            String   @unique
  username         String   @unique
  passwordHash     String
  displayName      String
  avatarUrl        String?
  bio              String?
  isSellerEnabled  Boolean  @default(false)
  sellerRating     Float    @default(5.0)
  walletBalance    Int      @default(0)
  stripeCustomerId String?
  createdAt        DateTime @default(now())

  streamsHosted    Stream[]
  bidsPlaced       Bid[]
  spotsPurchased   SpotReservation[]
  walletTxns       WalletTransaction[]
  followers        Follow[] @relation("Followed")
  following        Follow[] @relation("Follower")
}

model Stream {
  id              String    @id @default(uuid())
  sellerId        String
  seller          User      @relation(fields: [sellerId], references: [id])
  title           String
  thumbnailUrl    String?
  category        String
  status          String
  livekitRoomName String    @unique
  viewerCount     Int       @default(0)
  startedAt       DateTime?
  endedAt         DateTime?
  createdAt       DateTime  @default(now())

  listings        Listing[]
  chatMessages    ChatMessage[]
}

model Listing {
  id            String    @id @default(uuid())
  streamId      String
  stream        Stream    @relation(fields: [streamId], references: [id])
  type          String
  title         String
  description   String?
  imageUrl      String?

  startingBid   Int?
  currentBid    Int?
  bidIncrement  Int?
  highBidderId  String?
  endsAt        DateTime?

  totalSpots    Int?
  spotsSold     Int?      @default(0)
  pricePerSpot  Int?

  price         Int?
  inventory     Int?

  status        String
  createdAt     DateTime  @default(now())

  bids          Bid[]
  reservations  SpotReservation[]
}

model Bid {
  id        String   @id @default(uuid())
  listingId String
  listing   Listing  @relation(fields: [listingId], references: [id])
  bidderId  String
  bidder    User     @relation(fields: [bidderId], references: [id])
  amount    Int
  createdAt DateTime @default(now())
}

model SpotReservation {
  id         String   @id @default(uuid())
  listingId  String
  listing    Listing  @relation(fields: [listingId], references: [id])
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  status     String
  spotNumber Int?
  heldUntil  DateTime
  createdAt  DateTime @default(now())

  @@unique([listingId, userId, status])
}

model WalletTransaction {
  id                    String   @id @default(uuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id])
  type                  String
  amountCents           Int
  balanceAfter          Int
  description           String
  stripePaymentIntentId String?
  metadata              Json?
  createdAt             DateTime @default(now())
}

model ChatMessage {
  id       String   @id @default(uuid())
  streamId String
  stream   Stream   @relation(fields: [streamId], references: [id])
  userId   String
  text     String
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

- [ ] **Step 2: Create PostgreSQL database**

```bash
createdb whatnot
```

If using Docker instead:
```bash
docker run -d --name whatnot-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=whatnot -p 5432:5432 postgres:16
```

- [ ] **Step 3: Run initial migration**

```bash
cd server
npx prisma migrate dev --name init
```

Expected: Migration created and applied. All tables created. Prisma client generated.

- [ ] **Step 4: Verify with Prisma Studio**

```bash
cd server
npx prisma studio
```

Expected: Opens browser showing all 8 tables with correct columns. Close after verifying.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/
git commit -m "feat: add Prisma schema with all models and run init migration"
```

---

## Task 3: JWT helpers

**Files:**
- Create: `server/src/lib/jwt.ts`
- Create: `server/src/types/index.ts`

- [ ] **Step 1: Create types**

Create `server/src/types/index.ts`:

```typescript
import { Request } from "express";

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}
```

- [ ] **Step 2: Create JWT helpers**

Create `server/src/lib/jwt.ts`:

```typescript
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/types/ server/src/lib/jwt.ts
git commit -m "feat: add JWT sign/verify helpers and auth types"
```

---

## Task 4: Auth service

**Files:**
- Create: `server/src/services/auth.service.ts`

- [ ] **Step 1: Create auth service**

Create `server/src/services/auth.service.ts`:

```typescript
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { signAccessToken, signRefreshToken } from "../lib/jwt";

const SALT_ROUNDS = 12;

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  displayName: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName,
    },
  });

  const payload = { userId: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { user, accessToken, refreshToken };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const payload = { userId: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { user, accessToken, refreshToken };
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      isSellerEnabled: true,
      sellerRating: true,
      walletBalance: true,
      createdAt: true,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/
git commit -m "feat: add auth service with signup, login, getUserById"
```

---

## Task 5: Auth middleware

**Files:**
- Create: `server/src/middleware/authenticate.ts`

- [ ] **Step 1: Create authenticate middleware**

Create `server/src/middleware/authenticate.ts`:

```typescript
import { Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AuthenticatedRequest } from "../types";

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid token" },
    });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/middleware/
git commit -m "feat: add JWT authenticate middleware"
```

---

## Task 6: Auth routes

**Files:**
- Create: `server/src/routes/auth.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create auth routes**

Create `server/src/routes/auth.ts`:

```typescript
import { Router, Request, Response } from "express";
import { z } from "zod";
import { createUser, loginUser, getUserById } from "../services/auth.service";
import { signAccessToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";

const router = Router();

const signupSchema = z.object({
  email: z.string().email("Invalid email format"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required").max(50, "Display name must be at most 50 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

router.post("/signup", async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  try {
    const result = await createUser(parsed.data);
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        displayName: result.user.displayName,
        avatarUrl: result.user.avatarUrl,
        bio: result.user.bio,
        isSellerEnabled: result.user.isSellerEnabled,
        walletBalance: result.user.walletBalance,
        createdAt: result.user.createdAt,
      },
      accessToken: result.accessToken,
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      const field = err.meta?.target?.[0] || "field";
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: `${field} already in use`,
          details: [{ field, message: `This ${field} is already taken` }],
        },
      });
      return;
    }
    console.error("Signup error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  const result = await loginUser(parsed.data.email, parsed.data.password);
  if (!result) {
    res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
    });
    return;
  }

  res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      displayName: result.user.displayName,
      avatarUrl: result.user.avatarUrl,
      bio: result.user.bio,
      isSellerEnabled: result.user.isSellerEnabled,
      walletBalance: result.user.walletBalance,
      createdAt: result.user.createdAt,
    },
    accessToken: result.accessToken,
  });
});

router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "No refresh token" },
    });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "User not found" },
      });
      return;
    }
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    res.json({ accessToken });
  } catch {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid refresh token" },
    });
  }
});

router.get("/me", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const user = await getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "User not found" },
    });
    return;
  }
  res.json({ user });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refreshToken", { path: "/" });
  res.json({ message: "Logged out" });
});

export default router;
```

- [ ] **Step 2: Mount auth routes in index.ts**

Replace `server/src/index.ts` with:

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 3: Verify server compiles and starts**

```bash
cd server
npx tsx src/index.ts
```

Expected: `Server running on port 3001`. Kill after verifying.

- [ ] **Step 4: Test auth endpoints manually with curl**

```bash
# Signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"testuser","password":"password123","displayName":"Test User"}' \
  -c cookies.txt

# Expected: 201 with { user: {...}, accessToken: "..." }

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}' \
  -c cookies.txt

# Expected: 200 with { user: {...}, accessToken: "..." }

# Me (use the accessToken from login response)
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <access-token-from-above>"

# Expected: 200 with { user: {...} }

# Refresh
curl -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt

# Expected: 200 with { accessToken: "..." }

# Logout
curl -X POST http://localhost:3001/api/auth/logout

# Expected: 200 with { message: "Logged out" }
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/ server/src/index.ts
git commit -m "feat: add auth routes (signup, login, refresh, me, logout)"
```

---

## Task 7: Initialize shadcn/ui and theme on client

**Files:**
- Modify: `client/app/globals.css`
- Modify: `client/app/layout.tsx`

- [ ] **Step 1: Install shadcn/ui**

```bash
cd client
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

- [ ] **Step 2: Install shadcn components we need**

```bash
cd client
npx shadcn@latest add button input card avatar
```

- [ ] **Step 3: Update globals.css for Whatnot theme**

Replace `client/app/globals.css` with:

```css
@import "tailwindcss";

@theme inline {
  --color-background: #ffffff;
  --color-foreground: #171717;
  --color-primary: #FFD600;
  --color-primary-foreground: #000000;
  --color-secondary: #f5f5f5;
  --color-secondary-foreground: #171717;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #737373;
  --color-accent: #f5f5f5;
  --color-accent-foreground: #171717;
  --color-destructive: #ef4444;
  --color-destructive-foreground: #ffffff;
  --color-border: #e5e5e5;
  --color-input: #e5e5e5;
  --color-ring: #FFD600;
  --color-live: #ef4444;
  --font-sans: "Inter", sans-serif;
  --radius-lg: 1rem;
  --radius-xl: 1.25rem;
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}
```

Note: shadcn/ui init may modify globals.css. Adapt the above to work with whatever shadcn generates — the key additions are `--color-primary: #FFD600`, `--color-live: #ef4444`, and `--font-sans: "Inter"`.

- [ ] **Step 4: Update layout.tsx with Inter font**

Replace `client/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Whatnot — Live Auctions & Shopping",
  description: "Buy and sell in live auctions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify the client still builds**

```bash
cd client
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
cd client
git add .
git commit -m "feat: initialize shadcn/ui with Whatnot yellow theme and Inter font"
```

---

## Task 8: Mock data

**Files:**
- Create: `client/lib/mock-data.ts`

- [ ] **Step 1: Create mock data file**

Create `client/lib/mock-data.ts`:

```typescript
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
    title: "Opening Rare Pokemon Booster Boxes! 🔥",
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
```

- [ ] **Step 2: Commit**

```bash
cd client
git add lib/mock-data.ts
git commit -m "feat: add mock stream and category data"
```

---

## Task 9: Layout components (Navbar, Sidebar, Footer)

**Files:**
- Create: `client/components/layout/Navbar.tsx`
- Create: `client/components/layout/Sidebar.tsx`
- Create: `client/components/layout/Footer.tsx`

- [ ] **Step 1: Create Navbar**

Create `client/components/layout/Navbar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Search, Heart, MessageCircle, Bell, Gift } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            whatnot
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className="px-3 py-1.5 text-sm font-medium rounded-full bg-black text-white"
            >
              Home
            </Link>
            <Link
              href="/browse"
              className="px-3 py-1.5 text-sm font-medium rounded-full text-muted-foreground hover:bg-secondary"
            >
              Browse
            </Link>
          </nav>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for anything..."
              className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary border-none text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <button className="hidden lg:inline-flex px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            Become a Seller
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <Heart className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <MessageCircle className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <Bell className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <Gift className="h-5 w-5" />
          </button>
          <Link href="/login">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              ?
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create Sidebar**

Create `client/components/layout/Sidebar.tsx`:

```tsx
"use client";

import { sidebarCategories } from "@/lib/mock-data";

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border p-4 overflow-y-auto">
      <p className="text-sm font-semibold mb-4">Hello!</p>
      <nav className="flex flex-col gap-0.5">
        {sidebarCategories.map((category) => (
          <button
            key={category}
            className="text-left px-3 py-2 text-sm rounded-lg hover:bg-secondary transition-colors"
          >
            {category}
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create Footer**

Create `client/components/layout/Footer.tsx`:

```tsx
import Link from "next/link";

const footerLinks = [
  { label: "Blog", href: "#" },
  { label: "Careers", href: "#" },
  { label: "About Us", href: "#" },
  { label: "FAQ", href: "#" },
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Contact", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-white py-6 px-4">
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
        {footerLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="hover:text-foreground transition-colors"
          >
            {link.label}
          </Link>
        ))}
        <span className="text-xs">English (US)</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Install lucide-react icons**

```bash
cd client
npm install lucide-react
```

- [ ] **Step 5: Commit**

```bash
cd client
git add components/layout/
git commit -m "feat: add Navbar, Sidebar, and Footer layout components"
```

---

## Task 10: StreamCard and CategoryTile components

**Files:**
- Create: `client/components/stream/StreamCard.tsx`
- Create: `client/components/stream/CategoryTile.tsx`

- [ ] **Step 1: Create StreamCard**

Create `client/components/stream/StreamCard.tsx`:

```tsx
import Image from "next/image";
import { MockStream } from "@/lib/mock-data";

export function StreamCard({ stream }: { stream: MockStream }) {
  return (
    <div className="flex-shrink-0 w-48 cursor-pointer group">
      {/* Thumbnail */}
      <div className="relative w-48 h-64 rounded-xl overflow-hidden bg-muted">
        <Image
          src={stream.thumbnailUrl}
          alt={stream.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-200"
          sizes="192px"
        />
        {/* Live badge */}
        {stream.isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-live text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Live · {stream.viewerCount.toLocaleString()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-2 flex items-start gap-2">
        <Image
          src={stream.sellerAvatar}
          alt={stream.sellerUsername}
          width={28}
          height={28}
          className="rounded-full mt-0.5"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{stream.sellerUsername}</p>
          <p className="text-xs text-muted-foreground truncate">{stream.title}</p>
          <span className="text-xs text-muted-foreground">{stream.category}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CategoryTile**

Create `client/components/stream/CategoryTile.tsx`:

```tsx
import { MockCategory } from "@/lib/mock-data";

export function CategoryTile({ category }: { category: MockCategory }) {
  return (
    <button className="flex-shrink-0 flex flex-col items-center justify-center w-40 h-24 rounded-xl bg-primary/20 hover:bg-primary/30 transition-colors">
      <span className="text-sm font-semibold text-foreground">{category.name}</span>
      <span className="text-xs text-muted-foreground mt-1">
        {category.viewerCount.toLocaleString()} watching
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd client
git add components/stream/
git commit -m "feat: add StreamCard and CategoryTile components"
```

---

## Task 11: Home page

**Files:**
- Modify: `client/app/page.tsx`

- [ ] **Step 1: Replace home page with Whatnot layout**

Replace `client/app/page.tsx` with:

```tsx
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { StreamCard } from "@/components/stream/StreamCard";
import { CategoryTile } from "@/components/stream/CategoryTile";
import { mockStreams, mockCategories } from "@/lib/mock-data";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Live Now */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Live Now</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {mockStreams.map((stream) => (
                <StreamCard key={stream.id} stream={stream} />
              ))}
            </div>
          </section>

          {/* Categories You Might Like */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">
              Categories You Might Like
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {mockCategories.map((category) => (
                <CategoryTile key={category.slug} category={category} />
              ))}
            </div>
          </section>

          {/* Recommended sections per category */}
          {["Electronics", "Pokemon Cards", "Sports Cards"].map(
            (categoryName) => {
              const streams = mockStreams.filter(
                (s) => s.category === categoryName
              );
              if (streams.length === 0) return null;
              return (
                <section key={categoryName} className="mb-8">
                  <h2 className="text-lg font-semibold mb-4">
                    Recommended in {categoryName}
                  </h2>
                  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {streams.map((stream) => (
                      <StreamCard key={stream.id} stream={stream} />
                    ))}
                  </div>
                </section>
              );
            }
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Update next.config.ts to allow external images**

Replace `client/next.config.ts` with:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 3: Verify the home page renders**

```bash
cd client
npm run dev
```

Open `http://localhost:3000`. Expected: Whatnot-style layout with yellow theme, navbar with search bar, left sidebar with categories, scrolling stream cards with live badges, category tiles, footer.

- [ ] **Step 4: Commit**

```bash
cd client
git add app/page.tsx next.config.ts
git commit -m "feat: build Whatnot-style home page with mock data"
```

---

## Task 12: API client and auth context

**Files:**
- Create: `client/lib/api.ts`
- Create: `client/lib/auth-context.tsx`
- Create: `client/hooks/useAuth.ts`
- Modify: `client/app/layout.tsx`

- [ ] **Step 1: Create API client**

Create `client/lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // If 401 and we had a token, try refreshing
  if (res.status === 401 && accessToken) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      accessToken = data.accessToken;
      headers["Authorization"] = `Bearer ${accessToken}`;

      return fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }

    // Refresh failed — clear token
    accessToken = null;
  }

  return res;
}
```

- [ ] **Step 2: Create auth context**

Create `client/lib/auth-context.tsx`:

```tsx
"use client";

import { createContext, useCallback, useEffect, useState, ReactNode } from "react";
import { apiFetch, setAccessToken } from "./api";

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isSellerEnabled: boolean;
  walletBalance: number;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to restore session on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"}/auth/refresh`,
          { method: "POST", credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);

          const meRes = await apiFetch("/auth/me");
          if (meRes.ok) {
            const meData = await meRes.json();
            setUser(meData.user);
          }
        }
      } catch {
        // No session — that's fine
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Login failed");
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const signup = useCallback(
    async (input: {
      email: string;
      username: string;
      password: string;
      displayName: string;
    }) => {
      const res = await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Signup failed");
      }
      const data = await res.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
    },
    []
  );

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 3: Create useAuth hook**

Create `client/hooks/useAuth.ts`:

```typescript
"use client";

import { useContext } from "react";
import { AuthContext } from "@/lib/auth-context";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Wrap layout with AuthProvider**

Replace `client/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Whatnot — Live Auctions & Shopping",
  description: "Buy and sell in live auctions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/api.ts lib/auth-context.tsx hooks/useAuth.ts app/layout.tsx
git commit -m "feat: add API client, auth context, and useAuth hook"
```

---

## Task 13: Auth pages (Login and Signup)

**Files:**
- Create: `client/app/(auth)/login/page.tsx`
- Create: `client/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create login page**

Create `client/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-border p-6">
        <h1 className="text-2xl font-bold text-center mb-1">Welcome back</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Log in to your Whatnot account
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-foreground font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create signup page**

Create `client/app/(auth)/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup({ email, username, password, displayName });
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-border p-6">
        <h1 className="text-2xl font-bold text-center mb-1">Create an account</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Join Whatnot and start collecting
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="^[a-zA-Z0-9_]+$"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="your_username"
            />
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm font-medium mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={50}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Your Name"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify auth pages render**

```bash
cd client
npm run dev
```

Open `http://localhost:3000/login` and `http://localhost:3000/signup`. Expected: Centered card forms with yellow CTA buttons. Links toggle between pages.

- [ ] **Step 4: Commit**

```bash
cd client
git add app/\(auth\)/
git commit -m "feat: add login and signup pages"
```

---

## Task 14: Wire up Navbar with auth state

**Files:**
- Modify: `client/components/layout/Navbar.tsx`
- Modify: `client/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update Navbar to show auth state**

Replace `client/components/layout/Navbar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Search, Heart, MessageCircle, Bell, Gift } from "lucide-react";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            whatnot
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className="px-3 py-1.5 text-sm font-medium rounded-full bg-black text-white"
            >
              Home
            </Link>
            <Link
              href="/browse"
              className="px-3 py-1.5 text-sm font-medium rounded-full text-muted-foreground hover:bg-secondary"
            >
              Browse
            </Link>
          </nav>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for anything..."
              className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary border-none text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <button className="hidden lg:inline-flex px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                Become a Seller
              </button>
              <button className="p-2 rounded-full hover:bg-secondary">
                <Heart className="h-5 w-5" />
              </button>
              <button className="p-2 rounded-full hover:bg-secondary">
                <MessageCircle className="h-5 w-5" />
              </button>
              <button className="p-2 rounded-full hover:bg-secondary">
                <Bell className="h-5 w-5" />
              </button>
              <button className="p-2 rounded-full hover:bg-secondary">
                <Gift className="h-5 w-5" />
              </button>
              <button
                onClick={() => logout()}
                className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground"
                title={`Logged in as ${user.username}`}
              >
                {user.displayName.charAt(0).toUpperCase()}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-1.5 text-sm font-semibold rounded-full border border-border hover:bg-secondary transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Update Sidebar to show username**

Replace `client/components/layout/Sidebar.tsx` with:

```tsx
"use client";

import { useAuth } from "@/hooks/useAuth";
import { sidebarCategories } from "@/lib/mock-data";

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border p-4 overflow-y-auto">
      <p className="text-sm font-semibold mb-4">
        {user ? `Hello ${user.username}!` : "Hello!"}
      </p>
      <nav className="flex flex-col gap-0.5">
        {sidebarCategories.map((category) => (
          <button
            key={category}
            className="text-left px-3 py-2 text-sm rounded-lg hover:bg-secondary transition-colors"
          >
            {category}
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: End-to-end verification**

Start both servers:
```bash
# Terminal 1
cd server && npx tsx src/index.ts

# Terminal 2
cd client && npm run dev
```

Test flow:
1. Visit `http://localhost:3000` — see home page with "Log In" / "Sign Up" in navbar
2. Click "Sign Up" — fill out form — submit — redirected to home, navbar shows avatar initial and username in sidebar
3. Click avatar to log out — navbar shows "Log In" / "Sign Up" again
4. Click "Log In" — enter credentials — submit — redirected to home, logged in again
5. Refresh the page — should remain logged in (refresh token restores session)

- [ ] **Step 4: Commit**

```bash
cd client
git add components/layout/Navbar.tsx components/layout/Sidebar.tsx
git commit -m "feat: wire Navbar and Sidebar with auth state"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | Express + TypeScript server scaffold |
| 2 | Prisma schema + PostgreSQL migration |
| 3 | JWT sign/verify helpers |
| 4 | Auth service (signup, login, getUserById) |
| 5 | JWT authenticate middleware |
| 6 | Auth routes + mount on Express |
| 7 | shadcn/ui + Whatnot yellow theme + Inter font |
| 8 | Mock stream/category data |
| 9 | Navbar, Sidebar, Footer components |
| 10 | StreamCard + CategoryTile components |
| 11 | Home page assembly |
| 12 | API client + AuthContext + useAuth |
| 13 | Login + Signup pages |
| 14 | Wire Navbar/Sidebar with live auth state |
