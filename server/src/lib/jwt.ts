import jwt from "jsonwebtoken";
import { JwtPayload } from "../types";

const accessRaw = process.env.JWT_ACCESS_SECRET;
const refreshRaw = process.env.JWT_REFRESH_SECRET;

if (!accessRaw || accessRaw.length < 32) {
  throw new Error("JWT_ACCESS_SECRET must be set and at least 32 characters");
}
if (!refreshRaw || refreshRaw.length < 32) {
  throw new Error("JWT_REFRESH_SECRET must be set and at least 32 characters");
}

const ACCESS_SECRET: string = accessRaw;
const REFRESH_SECRET: string = refreshRaw;

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, ACCESS_SECRET);
  return decoded as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, REFRESH_SECRET);
  return decoded as JwtPayload;
}
