import { RoomServiceClient, AccessToken } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn("LIVEKIT_API_KEY/LIVEKIT_API_SECRET not set — LiveKit features will not work");
}

const httpUrl = LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://");

export const roomService = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

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
