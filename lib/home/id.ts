/**
 * One id generator for every device-local record (stack compounds, custom
 * compounds, dose-log-linked rows). ALWAYS returns a valid RFC-4122 v4 *shape*,
 * even in an insecure context (a plain-http LAN IP on a phone) where
 * `crypto.randomUUID()` is unavailable.
 *
 * WHY the uuid shape matters: `protocolSync.resolvePcId` keeps a client id as-is
 * when it's a uuid, but hashes it to a *different* deterministic uuid otherwise.
 * The old `c_…` / `s_…` fallbacks were NOT uuids, so in an insecure context the
 * Postgres row's id diverged from the local id — which duplicated the compound
 * after cloud hydration and broke the stock / dose-log joins. A uuid-shaped
 * fallback round-trips unchanged, so local and Postgres stay joined by the same id.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID()
    } catch {
      /* insecure context — fall through to the manual shape */
    }
  }
  // Manual v4 shape via Math.random — non-cryptographic, but fine for a
  // device-local id, and crucially still a valid uuid so it never diverges.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
