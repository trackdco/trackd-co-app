# Adrian's checklist

**Everything still owed BY you.** Anything finished has been deleted — if it's
not here, it's done. Full history is in git.

Last updated: 2026-08-14 (notes screenshot shipped; re-verified against the
running app, not against this file's own previous claims)

---

## 0. 💳 BILLING GO-LIVE — the gate, kept as an artifact

https://claude.ai/code/artifact/88253416-0621-4f5f-b781-74d80fae8329

Your Stripe dashboard list, every copy and behaviour decision from 14 Aug, the
go-live order, what is being built, what is going to the spec writer, and what
is knowingly left open. Deliberately NOT a file in this repo (Adrian's call,
2026-08-14) so it stays somewhere he actually reads.

Three things in it are yours and nobody else can do them:

1. **The Stripe dashboard**, all of it, and then **all of it again in live
   mode** because none of the settings carry across.
2. **`angusbrake6@gmail.com` has to sign up** before the beta backfill runs, or
   his free-for-life entry silently does nothing.
3. ~~**The legal documents.** You have a **v1.4 written and not yet in the code**;
   the live rows are v1.3 and have not been reviewed since 20 June. Whatever
   lands must add: **billing** (subscriptions, trials, renewals), **Stripe named
   as a sub-processor** in the Privacy Policy, and **the refund policy below**.~~

   **✅ DONE 2026-08-25. Corrected here 26 August** — this file was not named in
   the reconcile brief and was asserting v1.3 alongside the other three records.
   **Four v2.0 documents are live and current**, effective 2026-08-27, measured
   from the rows on 26 August: terms of service, privacy policy, medical
   disclaimer, and a new **consumer health data privacy policy** (Washington's My
   Health My Data Act).

   ⚠️ **THERE IS NO v1.4 AND THERE NEVER WAS.** The ladder in the database is
   0.1/0.2 → 1.0 → 1.3 → 2.0. The v1.4 draft named here never reached a row, so
   the three v2.0 documents inherited its number into their own lineage line and
   read **"Supersedes v1.4."** — pointing at a version that does not exist. Your
   ruling is that it should read **"Supersedes v1.3."**; the SQL is written and
   waiting for you to run it, and it is one character per row.

### 3a. 💷 THE REFUND POLICY — decided 2026-08-14, needs writing into the ToS

There is **no refund policy anywhere today**: not in the app, not in the legal
documents, not on the Stripe account. Stripe expects one to be reachable, and it
is the document a disputed charge gets judged against.

**The shape you chose:**

- They **request by email** to support@trackdco.app. No self-serve refund button.
- **We reply, and refund if the reason is valid**, issued through Stripe to the
  original payment method.
- **Refunds are issued manually in the Stripe dashboard.** No code, no admin
  control. Worth knowing that means every refund is you.

**⚠️ "Within a week" is slower than the chargeback reflex.** Somebody who has not
heard back in three or four days opens a dispute with their bank instead, and a
dispute costs the fee, the money and a mark on the account whichever way it is
decided. **Promise 2 business days in the policy** and let a week be the outer
limit you never actually use. That single number protects the dispute rate more
than the policy's wording does.

**What "valid" needs to mean, so it is not decided per email.** A starting
position, yours to change:

*Refund:*
- charged after they cancelled, or charged twice
- billed for a period they could not use because of an outage, a bug, or being
  wrongly put into read only
- an accidental renewal where they have not opened the app since the charge

*Do not refund:*
- changed their mind part-way through a period they have been using
- forgot to cancel but used the product during the period
- dissatisfaction with their own results, which Trackd Co does not sell

**⚠️ Get this looked at by an Australian lawyer with the rest of the pack.**
Australian Consumer Law gives consumers guarantees that cannot be contracted out
of, so a policy that reads as "no refunds" is unenforceable and worse than none.
This is not legal advice, it is a flag: it belongs in the same review as the
Privacy Policy's sub-processor list and the compound-naming question already in
`progress-tracker.md` → Open Questions.

✅ `supabase/billing/002` is applied (you, 14 Aug) and verified against the live
schema rather than its header.

---

## 1. The notes screenshot — SHIPPED, one call left

Your capture is live as the left panel of the hook screen. The typeset
`NOTES_LINES` array it replaced is deleted.

Both of the things I flagged are closed: the compound names are your decision
and are recorded as such in `notes-compare.tsx` and the tracker, and the lab
attachment's patient name and account number are opaquely redacted — checked
pixel-level, and the capture is flattened so nothing is recoverable underneath.
**Any replacement asset gets that same check before it ships.**

**The one thing left is yours:** the panel currently shows the TOP of the note,
which is a clean seven-line weekly schedule. The card floating next to it says
*Jumbled · Out of date · Guesswork*, and a tidy list argues against it. The
actual mess in your note — the struck-through `ghk-cu (10u)`,
`Reta: storage (forgot to log??)`, three ticked boxes and a fourth left open —
sits at roughly 38–78% of the capture and is out of frame.

Moving `object-position` down is one line. It puts the crossed-out line and the
open box on screen and costs you the **Protocol** heading. Tell me which you
want.

---

## 2. The gym-floor backdrop — still nothing behind the hook

`HOOK_BACKDROP` in `components/onboarding/screens/hook.tsx` is still `null`, so
the first screen renders on the plain canvas. The slot is wired and waiting:
drop a file at `public/onboarding/hook-backdrop.jpg` and set the constant.

It renders at 30% opacity under a three-stop scrim, and it settles out of a
slight overscale on entry. So it wants something with **large soft shapes and no
fine detail** — a gym floor, plates, a rack in low light. Anything busy turns to
noise at 30% and fights the headline.

**Signatures are NOT owed** — they were built and then cut at your call
(2026-08-05). This list used to imply otherwise.

---

## 3. Progress photos — the female set

Current three are `public/onboarding/progress-{1,2,3}.jpg`, blurred with
`gblur=sigma=56,eq=saturation=0.55:brightness=-0.10`, and they render in the
demo screen at ~100px wide.

**A female set is wanted** so the demo matches the sex chosen on the gender
screen. Name them `progress-f-{1,2,3}.jpg`.

**Files alone will not switch it.** `demo.tsx` hardcodes the three male paths in
a plain array with no gender branch, so when the set lands I need to make that
array sex-aware — same mirror-front convention the body maps already use. Small
change, but it is a change, not a drop-in.

**Prompt** (run three times, changing only the pose):

> A photorealistic smartphone mirror selfie in a modern minimalist bathroom
> with warm neutral lighting, large mirror, matte black fixtures, light stone
> tiles. A fit adult woman in plain black shorts and a plain black sports top,
> athletic build, standing squarely facing the mirror, holding a phone at chest
> height that obscures part of the face. Shot on a phone camera, natural indoor
> light, slight warmth, shallow depth of field. Vertical 3:4 framing, full body
> from mid-thigh up. Neutral expression, no text, no watermarks, no logos, no
> jewellery.

Poses: **1** front relaxed, **2** back to the mirror, **3** front with one arm
flexed. Then process each with:

```sh
ffmpeg -i in.png -vf "gblur=sigma=56,eq=saturation=0.55:brightness=-0.10" -q:v 4 out.jpg
```

Generated rather than photographed, for the same reason as the current set:
these sit behind a heavy blur at thumbnail size, so nothing survives anyway, and
a generated figure raises no question about whose body strangers are looking at.

**If you shoot new app screenshots, the frame is `1170 × 2532`** — the real
iPhone 390×844 ratio, not the old 1170×2280. `object-cover` crops a mismatch
silently and never errors, so a wrong ratio just quietly eats the tab bar.
Export a real PNG: an iPhone HEIC renamed `.png` does not render in Chrome, and
three of the five you sent were exactly that.

---

## 4. Decisions waiting on you

- **Cost screen** — **G** is already wired into the flow. Confirm it's final and
  the other seven variants plus the `/onboarding/cost` route get deleted.
- **Welcome effect** — `EFFECT = "assemble"` is set in `screens/greeting.tsx`.
  Confirm and `/onboarding/welcome-effects` goes.
- **Payoff** — **B3** ships. Confirm and `/onboarding/payoff` goes.
- **The greeting's closing line** currently reads *"Let's learn a bit more, so
  Trackd can be built around what you actually run."* Yours to approve.

Those three dev routes are the last things standing between the flow and a clean
surface. One word on each and they're gone.

---

## 5. ⚠️ Nothing routes to `/onboarding`

**Re-verified 2026-08-14 and still true.** `app/page.tsx` renders the older
"First Run" screen. There is no link, redirect or middleware rule anywhere in
the app pointing at `/onboarding` — the single match in a search is an internal
`redirect("/onboarding?step=plans")` *inside* the flow, which moves someone
already in it and is not a way in.

So the whole thing — paywall, Stripe, the trial reminder, everything built over
the last fortnight — is unreachable by a real user. **This is the item that
decides whether any of the rest matters.**

---

## 6. Promised in the flow, not built

- **Set up MY protocol before onboarding ends.** The flow finishes at `install`
  and hands over an empty app plus a demo vial of someone else's testosterone.
  This is the day-six churn item and the biggest thing left.
- **Bloods charted against the protocol that was running at the time.** It
  exists in the app, and onboarding mentions it once as a tick on the
  celebration screen and never shows it. The feature meant to make day eight
  hurt to lose.

---

## 7. Things only you can run

Supabase MCP is **not authorised** in my sessions — I write the SQL, you paste
it. Every file opens with a `▶ HOW TO RUN THIS` block: **paste the whole file**,
"no rows returned" is success, and the check at the bottom returns something if
it worked.

**Nothing is outstanding.** Swept the whole `supabase/` tree against the live
schema on 2026-08-14:

- **`billing/002_trial_start_lease.sql`** — ✅ applied and verified.
- **`protocol/013_stack_dating.sql`** — ✅ already applied. The tracker claimed
  otherwise for a week.
- **`protocol/024_review_repairs.sql`** — the one I cannot check from here (its
  checks read `pg_constraint`, which the Data API does not expose). On `main`
  since 2026-08-07 and idempotent, so re-paste it if you want certainty.

**Don't trust a file header or this list — probe.** Ten seconds, no MCP, strictly
read-only, and it has caught the same rot three times now:

```sh
set -a; source .env.local; set +a
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=<column>&limit=0"
# 200 = applied · 400 = column missing · 404 = table missing
```

---

## 8. Preview links

**⚠️ THE LAN IP MOVES.** It has changed three times (`10.1.4.185` →
`192.168.0.117` → now). If a link stops loading, check this before the server:
`ipconfig getifaddr en0`.

Current base: **`http://10.240.133.214:3100`**

- **The flow:** `/onboarding`
- **Cost screens (8):** `/onboarding/cost`
- **Payoff screens:** `/onboarding/payoff`
- **Welcome effects (4):** `/onboarding/welcome-effects`

A dev server is already up on **3100** — Next 16 refuses to start a second one
for the same directory, so start it only if nothing is listening:
`npm run dev -- -p 3100 -H 0.0.0.0`. Phone on the same wifi.

---

## 9. The final cold review

Cold review agents over the diff, categorised **critical / high / medium /
low** — you take the highs, I fix the rest. Several rounds have run and their
findings are in `progress-tracker.md`. The last pass is owed before launch, on
your call.
