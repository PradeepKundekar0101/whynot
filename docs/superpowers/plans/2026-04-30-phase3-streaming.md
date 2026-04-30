# Phase 3: Live Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enable sellers to go live with video streams via LiveKit, let viewers discover and watch streams, and track viewer counts with Redis.

**Architecture:** Backend creates LiveKit rooms and generates tokens (publisher for sellers, subscriber for viewers). Redis tracks viewer counts and caches live stream queries. The Stream model in Postgres stores metadata. Frontend has a go-live page for sellers and a stream watch page for viewers using LiveKit's React SDK. Home page switches from mock data to real live streams.

**Tech Stack:** LiveKit (Cloud or self-hosted), Redis (ioredis), LiveKit Server SDK, LiveKit React Components, Express

---

## File Structure

### Server (new + modified)

```
server/
  src/
    lib/redis.ts                # NEW: Redis client singleton
    lib/livekit.ts              # NEW: LiveKit RoomServiceClient + token generation
    services/stream.service.ts  # NEW: create/end stream, join/leave, list live streams
    routes/stream.ts            # NEW: stream CRUD + discovery endpoints
    index.ts                    # MODIFY: mount stream routes
```

### Client (new + modified)

```
client/
  app/
    stream/[id]/page.tsx        # NEW: stream watch page with LiveKit player
    seller/go-live/page.tsx     # NEW: broadcaster page
  components/
    stream/LiveStreamPlayer.tsx # NEW: wraps LiveKit video component
  lib/
    mock-data.ts                # MODIFY: keep for fallback but home page uses real data
  app/
    page.tsx                    # MODIFY: fetch real live streams, fallback to mock
```

---

## Task 1: Redis + LiveKit server setup

**Files:**
- Create: `server/src/lib/redis.ts`
- Create: `server/src/lib/livekit.ts`

### Redis client:

```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export default redis;
```

### LiveKit helpers:

```typescript
import { RoomServiceClient } from "livekit-server-sdk";
import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

export const roomService = new RoomServiceClient(
  LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://"),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

export async function createPublisherToken(roomName: string, identity: string, name: string): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return await token.toJwt();
}

export async function createViewerToken(roomName: string, identity: string, name: string): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
  });
  return await token.toJwt();
}
```

### Steps:
- Install: `npm install ioredis livekit-server-sdk`
- Install types: `npm install -D @types/ioredis` (if needed)
- Add env vars to .env.example: REDIS_URL, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
- Add placeholder values to .env
- Commit

---

## Task 2: Stream service

**Files:**
- Create: `server/src/services/stream.service.ts`

### Implementation:

```typescript
import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { roomService, createPublisherToken, createViewerToken } from "../lib/livekit";

const LIVE_STREAMS_CACHE_KEY = "streams:live";
const LIVE_STREAMS_CACHE_TTL = 5; // seconds

export async function createStream(sellerId: string, title: string, category: string) {
  const livekitRoomName = `stream-${uuidv4()}`;

  // Create LiveKit room
  await roomService.createRoom({ name: livekitRoomName });

  // Create stream record
  const stream = await prisma.stream.create({
    data: {
      sellerId,
      title,
      category,
      status: "live",
      livekitRoomName,
      startedAt: new Date(),
    },
    include: { seller: { select: { username: true, displayName: true, avatarUrl: true } } },
  });

  // Generate publisher token
  const token = await createPublisherToken(livekitRoomName, sellerId, stream.seller.displayName);

  // Invalidate cache
  await redis.del(LIVE_STREAMS_CACHE_KEY);

  return { stream, token };
}

export async function joinStream(streamId: string, userId: string, displayName: string) {
  const stream = await prisma.stream.findUniqueOrThrow({
    where: { id: streamId },
  });

  if (stream.status !== "live") {
    throw new Error("STREAM_NOT_LIVE");
  }

  // Generate viewer token
  const token = await createViewerToken(stream.livekitRoomName, userId, displayName);

  // Increment viewer count in Redis
  const viewerCount = await redis.incr(`stream:${streamId}:viewers`);

  // Update Postgres periodically (not every join — Redis is source of truth for live count)
  if (viewerCount % 5 === 0) {
    await prisma.stream.update({
      where: { id: streamId },
      data: { viewerCount },
    });
  }

  return { token, livekitRoomName: stream.livekitRoomName, viewerCount };
}

export async function leaveStream(streamId: string) {
  const viewerCount = await redis.decr(`stream:${streamId}:viewers`);
  // Don't go below 0
  if (viewerCount < 0) {
    await redis.set(`stream:${streamId}:viewers`, 0);
  }
}

export async function endStream(streamId: string, sellerId: string) {
  const stream = await prisma.stream.update({
    where: { id: streamId, sellerId },
    data: { status: "ended", endedAt: new Date() },
  });

  // Clean up Redis
  await redis.del(`stream:${streamId}:viewers`);
  await redis.del(LIVE_STREAMS_CACHE_KEY);

  // Delete LiveKit room
  try {
    await roomService.deleteRoom(stream.livekitRoomName);
  } catch {
    // Room may already be gone
  }

  return stream;
}

export async function getLiveStreams(category?: string) {
  // Check cache first (only for unfiltered queries)
  if (!category) {
    const cached = await redis.get(LIVE_STREAMS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }

  const where: any = { status: "live" };
  if (category) where.category = category;

  const streams = await prisma.stream.findMany({
    where,
    orderBy: { viewerCount: "desc" },
    include: {
      seller: {
        select: { username: true, displayName: true, avatarUrl: true },
      },
    },
  });

  // Enrich with live viewer counts from Redis
  const enriched = await Promise.all(
    streams.map(async (s) => {
      const liveCount = await redis.get(`stream:${s.id}:viewers`);
      return { ...s, viewerCount: liveCount ? parseInt(liveCount) : s.viewerCount };
    })
  );

  // Cache unfiltered results
  if (!category) {
    await redis.setex(LIVE_STREAMS_CACHE_KEY, LIVE_STREAMS_CACHE_TTL, JSON.stringify(enriched));
  }

  return enriched;
}

export async function getStreamById(streamId: string) {
  return prisma.stream.findUniqueOrThrow({
    where: { id: streamId },
    include: {
      seller: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });
}
```

### Steps:
- Install: `npm install uuid` and `npm install -D @types/uuid`
- Create stream.service.ts
- Commit

---

## Task 3: Stream routes

**Files:**
- Create: `server/src/routes/stream.ts`
- Modify: `server/src/index.ts`

### Routes:

```typescript
import { Router, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import {
  createStream,
  joinStream,
  leaveStream,
  endStream,
  getLiveStreams,
  getStreamById,
} from "../services/stream.service";

const router = Router();

const createStreamSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(50),
});

// POST /api/streams — create + go live
router.post("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid input",
        details: parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message })) },
    });
    return;
  }

  try {
    const result = await createStream(req.user!.userId, parsed.data.title, parsed.data.category);
    res.status(201).json({
      stream: result.stream,
      token: result.token,
    });
  } catch (err) {
    console.error("Create stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/live — list live streams
router.get("/live", async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const streams = await getLiveStreams(category);
    res.json({ streams });
  } catch (err) {
    console.error("Live streams error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/:id — get stream details
router.get("/:id", async (req, res) => {
  try {
    const stream = await getStreamById(req.params.id);
    res.json({ stream });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Stream not found" } });
      return;
    }
    console.error("Get stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/join — join as viewer
router.post("/:id/join", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await joinStream(req.params.id, req.user!.userId, req.user!.email);
    res.json(result);
  } catch (err: any) {
    if (err.message === "STREAM_NOT_LIVE") {
      res.status(400).json({ error: { code: "STREAM_NOT_LIVE", message: "Stream is not live" } });
      return;
    }
    console.error("Join stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/leave — leave as viewer
router.post("/:id/leave", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await leaveStream(req.params.id);
    res.json({ message: "Left stream" });
  } catch (err) {
    console.error("Leave stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/end — end stream (seller only)
router.post("/:id/end", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stream = await endStream(req.params.id, req.user!.userId);
    res.json({ stream });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Stream not found or not yours" } });
      return;
    }
    console.error("End stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

export default router;
```

### Mount in index.ts:
Add `import streamRoutes from "./routes/stream";` and `app.use("/api/streams", streamRoutes);`

### Steps:
- Create stream.ts
- Update index.ts
- Commit

---

## Task 4: Go-live page (seller broadcaster)

**Files:**
- Create: `client/app/seller/go-live/page.tsx`

### Implementation:
- Auth-guarded page
- Form: title + category selector (dropdown with the categories from mock-data)
- On submit: POST /api/streams → get token + stream info
- After creation: render LiveKit room with video/audio publishing using `@livekit/components-react`
- "End Stream" button calls POST /api/streams/:id/end
- Show stream URL for sharing

### Dependencies:
```bash
npm install @livekit/components-react @livekit/components-styles livekit-client
```

---

## Task 5: Stream watch page (viewer)

**Files:**
- Create: `client/app/stream/[id]/page.tsx`
- Create: `client/components/stream/LiveStreamPlayer.tsx`

### LiveStreamPlayer:
- Wraps LiveKit's VideoTrack component
- Shows seller's video feed
- Handles connection state (connecting, connected, disconnected)

### Stream watch page:
- Fetch stream details: GET /api/streams/:id
- Join stream: POST /api/streams/:id/join → get token
- Render 3-column layout (left panel placeholder, center video, right panel placeholder)
- On unmount: POST /api/streams/:id/leave
- Show seller info, title, viewer count

---

## Task 6: Home page — real live streams

**Files:**
- Modify: `client/app/page.tsx`

### Changes:
- Fetch live streams from GET /api/streams/live on mount
- If streams exist, render them; if none, fall back to mock data
- StreamCard links to /stream/[id]
- Keep categories section with mock data (categories aren't an API yet)
