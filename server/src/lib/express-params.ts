/**
 * Express 5 types `req.params` values as string | string[]. Routes that declare
 * a single `:segment` always receive a string at runtime; this narrows for callers.
 */
export function paramAsString(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}
