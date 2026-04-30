import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import crypto from "crypto";
import logger from "./logger";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  logger.warn("LIVEKIT_API_KEY/LIVEKIT_API_SECRET not set — LiveKit features will not work");
}

const httpUrl = LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://");

export const roomService = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

export async function createPublisherToken(
  roomName: string,
  userId: string,
  name: string
): Promise<string> {
  // Publisher uses the bare userId so seller-side state is stable across reconnects.
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name,
    metadata: JSON.stringify({ userId, role: "publisher" }),
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return await token.toJwt();
}

export async function createViewerToken(
  roomName: string,
  userId: string,
  name: string
): Promise<string> {
  // LiveKit requires unique identities per room. Same logged-in user may open
  // multiple viewer sessions, or even watch their own stream — so suffix a random id.
  const sessionId = crypto.randomBytes(4).toString("hex");
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `${userId}-v-${sessionId}`,
    name,
    metadata: JSON.stringify({ userId, role: "viewer" }),
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
  });
  return await token.toJwt();
}
