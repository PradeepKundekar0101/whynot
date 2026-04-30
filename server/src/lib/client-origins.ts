/**
 * Parses CLIENT_URL — comma-separated list of allowed browser origins for CORS
 * (and Socket.IO). Example:
 * CLIENT_URL=https://whatnot-break.vercel.app,https://www.example.com
 */
export function getAllowedClientOrigins(): string[] {
  const raw = process.env.CLIENT_URL || "http://localhost:3000";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
