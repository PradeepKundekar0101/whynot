import { Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AuthenticatedRequest } from "../types";

/**
 * Best-effort authentication. If the request has a valid Bearer token, fills
 * `req.user`. Missing/invalid tokens are silently ignored — handlers must check
 * `req.user` themselves for any auth-gated behavior.
 *
 * Use this on read endpoints that need to know the caller's identity to filter
 * sensitive fields (e.g. spot.preAssignedTeam) without forcing login.
 */
export function tryAuthenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Silently drop — anonymous request.
  }
  next();
}
