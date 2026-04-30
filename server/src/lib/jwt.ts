import jwt from "jsonwebtoken";
import { JwtPayload } from "../types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || ACCESS_SECRET.length < 32) {
  throw new Error("JWT_ACCESS_SECRET must be set and at least 32 characters");
}
if (!REFRESH_SECRET || REFRESH_SECRET.length < 32) {
  throw new Error("JWT_REFRESH_SECRET must be set and at least 32 characters");
}

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
