/**
 * THE DATES AND FACTS EVERY ENTRY INTO THE PLAN/CARD FLOW SHOWS.
 *
 * ⚠️ EXTRACTED FROM `app/onboarding/page.tsx` 2026-08-23, UNCHANGED, because a
 * SECOND entry point now exists.
 *
 * `/plans` and `/checkout` mount the same screens as `/onboarding` for somebody
 * who already has an account. If they resolved their own dates, the two entry
 * points could print different days for the same subscription — which is the
 * precise defect the comment below was written to kill, reintroduced one level
 * up. One function, both routes, one answer.
 *
 * Nothing here changed in the move. The body is verbatim.
 */
import { createClient } from "@/lib/supabase/server";
import { formatAccessDate } from "@/lib/billing/manage";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";
import { resolveFreeTime } from "@/lib/billing/freeTime";

/**
 * `profiles.timezone`, but only if `Intl` will actually accept it.
 *
 * ⚠️ THIS PAGE MOUNTS THE PAYMENT SHEET, AND A CORRUPT ROW USED TO 500 IT.
 *
 * Nothing between the client that writes that column and this read validates it
 * against the IANA database, and `Intl.DateTimeFormat` throws a `RangeError` on
 * a zone it does not know. Both `formatAccessDate` calls below sit OUTSIDE the
 * try in `onboardingDates` — that try only ever guarded the Supabase READ, never
 * the formatting — so one bad row took out the whole route for that user, every
 * time, with nothing they could do about it from the client.
 *
 * Checking the zone ONCE, here, rather than wrapping the two call sites: a
 * formatter added to this function later cannot reintroduce the crash, and the
 * fallback stays in one place. `formatAccessDate` handles a bad *date* already
 * (it returns "" on an unparseable ISO string); the zone was the unguarded half.
 */
function usableZone(tz: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export async function onboardingDates(
  signedIn: boolean,
  graceEndsAt: string | null,
): Promise<{ firstChargeOn: string; graceEndsOn: string | null }> {
  /** The same fallback `/billing` uses, so the two cannot print different days. */
  const FALLBACK = "Australia/Sydney";
  const projected = new Date(
    Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  let timezone = FALLBACK;
  if (signedIn) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();
        timezone = usableZone(data?.timezone as string | null) ?? FALLBACK;
      }
    } catch {
      // A display string is never worth failing a page render for.
    }
  }

  /**
   * ⚠️ THE GRACE DATE IS SHOWN AS THE SERVER WILL SET IT, CLAMP INCLUDED.
   *
   * A cold review found the screen printing the raw stored `active_until` while
   * `resolveFreeTime` clamps `trial_end` forward to `now + 48h` for anybody in
   * the last two days of their fortnight. Measured: the screen said "First
   * charge 15 Aug" and Stripe held `trial_end` at 17 Aug — a screen stating a
   * date the server contradicts, which is the invariant, and it happens to
   * EVERY beta account, because the final 48 hours is a window all of them pass
   * through.
   *
   * Running the same pure resolver the create call uses means the two cannot
   * disagree by construction. `hasUsedTrial` is irrelevant here: a live grace
   * takes precedence inside the resolver regardless of it.
   *
   * The direction was always safe — clamping only ever moves the charge LATER —
   * so this corrects what is SAID, not what is done.
   *
   * ## ⚠️ AND NO OTHER SURFACE MAY COPY THIS. THIS IS A CHARGE DATE.
   *
   * `06`'s launch notice states an ACCESS-ENDS date and must read
   * `entitlements.active_until` RAW, with no resolver and no clamp
   * (`components/billing/BetaLaunchNotice.tsx`). The two are different facts and
   * the difference is load-bearing:
   *
   *     charge date        clamped. Must match what Stripe will hold.
   *     access-ends date   the row. Must match what `05`'s gate enforces.
   *
   * The clamp only ever moves LATER, so a notice that ran this resolver would
   * promise access up to 48 hours BEYOND `active_until` — and the gate lapses AT
   * `active_until`. The screen would be over-promising against the thing that
   * enforces it, to every beta account in the final two days of their fortnight,
   * which is a window all of them pass through.
   *
   * It is also the one place D86's re-dating migration and the copy could
   * silently disagree: the migration sets the ROW, so anything reading the row
   * follows it automatically and anything computing does not. Driven end to end
   * in `scratchpad/harness/notice.scenario.ts` — move the row, and the notice
   * moves with it.
   */
  let graceShown: string | null = null;
  if (graceEndsAt) {
    const free = resolveFreeTime({ hasUsedTrial: false, graceEndsAt, now: new Date() });
    graceShown = formatAccessDate(
      free.kind === "grace" ? new Date(free.trialEnd * 1000).toISOString() : graceEndsAt,
      timezone,
    );
  }

  return {
    firstChargeOn: formatAccessDate(projected, timezone),
    graceEndsOn: graceShown,
  };
}
