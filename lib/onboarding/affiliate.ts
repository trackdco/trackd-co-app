/**
 * Creator / affiliate codes (Spec 3-01 · §6, §9 Screen 10, D-5, D-6).
 *
 * A code does two jobs: it attributes the signup to a creator for commission,
 * and it may deepen the offer. Onboarding only CAPTURES, VALIDATES and APPLIES
 * a code. Commission payout is a separate layer (D-5) and is deliberately not
 * modelled here.
 *
 * **Validation is non-blocking by design.** An invalid or expired code falls
 * back to the standard price and NEVER blocks the trial: a creator typo must
 * not cost a signup. That is why `validateCode` resolves to a verdict instead
 * of throwing.
 *
 * There is no code registry in the database yet, so `validateCode` reads a
 * local table. It is one function with one call site, so pointing it at a real
 * table later is a contained change.
 */

/** Codes are stored and compared upper-case with surrounding space trimmed. */
export function normaliseCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  // Untrusted input off a URL: keep it to a plausible code shape rather than
  // storing whatever arrived (`code-standards.md` — validate at the boundary).
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(trimmed)) return null;
  return trimmed;
}

/** Pull `?code=` off a query string. Returns null when absent or malformed. */
export function codeFromSearch(search: string): string | null {
  try {
    return normaliseCode(new URLSearchParams(search).get("code"));
  } catch {
    return null;
  }
}

export type CodeVerdict =
  | { status: "none" }
  | { status: "applied"; code: string; annualOnly: boolean }
  | { status: "invalid"; code: string };

/**
 * PLACEHOLDER registry. Adrian and Angus own the real list; this exists so the
 * applied and invalid states are both reachable in a preview without a
 * backend. D-6 default is applied: a code deepens the ANNUAL offer.
 */
const KNOWN_CODES: Record<string, { annualOnly: boolean }> = {
  TRACKD: { annualOnly: true },
  ANGUS: { annualOnly: true },
};

/**
 * Validate a code. Async because the real implementation will be a network
 * call, and callers should already be written to await it.
 */
export async function validateCode(raw: string | null): Promise<CodeVerdict> {
  const code = normaliseCode(raw);
  if (!code) return { status: "none" };
  const hit = KNOWN_CODES[code];
  if (!hit) return { status: "invalid", code };
  return { status: "applied", code, annualOnly: hit.annualOnly };
}
