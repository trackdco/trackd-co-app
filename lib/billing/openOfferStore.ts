/**
 * THE SAVE OFFER SURVIVES BEING DISMISSED BY ACCIDENT.
 *
 * Adrian, 2026-08-14: "if they click off the trial thing with the timer by
 * accident then they should be able to click back on and the timer is still
 * continuing."
 *
 * So the offer is remembered for the rest of its ten minutes. Tapping the
 * backdrop, pressing Escape, or navigating away and coming back all leave a way
 * back in, and the countdown carries on from when the offer was FIRST shown
 * rather than restarting. Restarting it would be the app quietly handing out a
 * longer window every time somebody fumbled a tap.
 *
 * ## ⚠️ THIS GRANTS NOTHING, AND CANNOT
 *
 * `sessionStorage` is writable by anybody with a browser console, so nothing
 * here may be trusted. It decides one thing only: whether a way back into the
 * dialog is drawn. The claim itself is checked on the server against Stripe's
 * own `trackd_save_offer_shown_at`, and a forged entry here reaches a server
 * that answers `expired`. See `grantExtraTime`.
 *
 * ## Why session, not local
 *
 * The window is ten minutes. `sessionStorage` dies with the tab, which is the
 * right lifetime for something that cannot outlive ten minutes anyway, and it
 * means a shared browser cannot leak one person's offer into the next person's
 * session. The user id is checked as well, because "shared browser" is a real
 * case on this project: the trial banner's dismissal cookie had exactly this bug
 * and a cold review caught it.
 */

const KEY = "trackd-open-save-offer";

export interface OpenOffer {
  /** Whose offer it is. A different account ignores it entirely. */
  userId: string;
  /** ISO instant the offer was first put on screen. The clock counts from here. */
  shownAt: string;
  kind: "trial" | "paid";
  noun: "week" | "month";
  /** ISO instant. The day money moves if they take it. */
  chargeOn: string;
}

/** The window, in milliseconds. Must match `OFFER_WINDOW_MINUTES` on the server. */
export const OPEN_OFFER_MS = 10 * 60 * 1000;

/**
 * How long is left, in milliseconds, or 0 once it has run out.
 *
 * Pure, so the countdown and the "should this be on screen at all" decision are
 * the same arithmetic rather than two that can disagree by a second.
 */
export function msRemaining(shownAt: string, now: number = Date.now()): number {
  const at = Date.parse(shownAt);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, at + OPEN_OFFER_MS - now);
}

/** "09:47". Always two digits, so the width does not jitter as it counts down. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Is this stored offer still worth drawing a way back into?
 *
 * Every check is a reason NOT to: wrong account, malformed, or out of time.
 */
export function isStillOpen(
  offer: OpenOffer | null,
  userId: string,
  now: number = Date.now(),
): offer is OpenOffer {
  if (!offer) return false;
  if (offer.userId !== userId) return false;
  return msRemaining(offer.shownAt, now) > 0;
}

/** Remember an offer that has just been shown. Best effort. */
export function rememberOffer(offer: OpenOffer): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(offer));
  } catch {
    // Private mode, a full quota, a browser that refuses. The dialog is on
    // screen right now either way; all that is lost is the way back into it.
  }
}

/** Forget it, once taken, declined for good, or run out. */
export function forgetOffer(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing depends on it: a stale entry is filtered by
    // `isStillOpen` on the way out anyway.
  }
}

/**
 * Read it back, or null.
 *
 * Every field is checked rather than trusted, because this is parsed from a
 * string a user can edit. A malformed entry is treated as absent, never as a
 * partially valid offer.
 */
export function readOffer(): OpenOffer | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.userId !== "string" || !o.userId) return null;
    if (typeof o.shownAt !== "string" || Number.isNaN(Date.parse(o.shownAt))) return null;
    if (typeof o.chargeOn !== "string") return null;
    if (o.kind !== "trial" && o.kind !== "paid") return null;
    if (o.noun !== "week" && o.noun !== "month") return null;
    return {
      userId: o.userId,
      shownAt: o.shownAt,
      chargeOn: o.chargeOn,
      kind: o.kind,
      noun: o.noun,
    };
  } catch {
    return null;
  }
}
