import type { CookieOptions } from "express";

/** True when frontend and API are on different registrable domains (SPA on Vercel, API elsewhere). */
function useCrossSiteCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Refresh-token cookie attributes. In production use SameSite=None + Secure so
 * `fetch(..., credentials: 'include')` from the SPA origin receives the cookie.
 * SameSite=Lax does NOT send cookies on cross-site POST (e.g. Vercel → API).
 */
export function getRefreshTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: useCrossSiteCookie(),
    sameSite: useCrossSiteCookie() ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

/** clearCookie must use the same SameSite/secure/path or the cookie may persist. */
export function getRefreshTokenClearCookieOptions(): CookieOptions {
  const o = getRefreshTokenCookieOptions();
  return { path: o.path, httpOnly: o.httpOnly, secure: o.secure, sameSite: o.sameSite };
}
