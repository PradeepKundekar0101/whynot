/**
 * Normalize REST base URL: trim slashes; if URL has no path (e.g. http://host:3001),
 * append /api because this server mounts REST under app.use("/api", ...).
 */
function normalizeRestApiBase(envValue: string | undefined): string {
  const fallback = "http://localhost:3001/api";
  const raw = (envValue || fallback).trim();
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    const stripped = u.pathname.replace(/\/+$/, "") || "/";
    if (stripped === "/") {
      u.pathname = "/api";
    }
    return u.toString().replace(/\/+$/, "");
  } catch {
    const t = raw.replace(/\/+$/, "");
    return t.endsWith("/api") ? t : `${t}/api`;
  }
}

export const API_BASE = normalizeRestApiBase(process.env.NEXT_PUBLIC_API_URL);

/**
 * Origin for non-REST connections (Socket.IO, raw WebSockets).
 * Socket.IO treats a trailing path segment as a namespace, so strip /api off the REST base.
 */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

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

  const base = API_BASE.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${base}${normalizedPath}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && accessToken) {
    const refreshRes = await fetch(`${API_BASE.replace(/\/+$/, "")}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      accessToken = data.accessToken;
      headers["Authorization"] = `Bearer ${accessToken}`;

      return fetch(`${base}${normalizedPath}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }

    accessToken = null;
  }

  return res;
}
