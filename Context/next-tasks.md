# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-29

---

## 🎯 Current focus

**Wave 2 · part one.** Working the seven refinement specs in order, one at a time,
on `spec-01-dose-integrity` (PR #61, not merged). **Specs 01–06 are BUILT** —
typecheck, lint, `next build` and 68 tests green; CodeRabbit round 1 fixed plus a
self-review round. Reviewed on **localhost** (`npm run dev`) and the PR's Vercel
preview. Next up: `07-global-sweep.md` — the last of part one.

### Blocked on Adrian
00. **Run `supabase/legal/011_support_email.sql`** — swaps `legal@trackdco.app` for
   `support@trackdco.app` in the CURRENT legal documents (their text lives in
   Postgres, not the repo). The in-app account-deletion request is already updated;
   until this runs, /terms and /privacy still print the dead address.
0. **Run `supabase/markers/001_rename_cycle_changes.sql`** — one idempotent UPDATE
   renaming the "Cycle Changes" marker to "Menstrual Changes" (Spec 04). No data
   migration: readings reference markers by id. Until it runs, that marker still
   reads "Cycle Changes" in the app; filtering is correct either way.
1. **Run `supabase/protocol/005_protocol_compound_schedules.sql` — needs sign-off.**
   The migration plan the spec asked for, in one line: a `protocol_compound_schedules`
   table holding each version of a compound's dose + schedule with the day it took
   effect. **Strictly additive** — nothing existing is altered, moved or deleted, and
   there is NO backfill (a compound with no versions resolves exactly as it does
   today). Cascades from `protocol_compounds`, ships its own RLS + grants. The app
   already runs correctly without it: every sync call swallows `42P01` and keeps
   versions in the device store, so applying it only starts backing them up. Say go
   and it runs via the Supabase MCP.
2. **Placeholder wording for an unset time** — currently **"Not set"**, worded once
   in `formatTimeLabel`. Since the time pre-fill was restored (2026-07-29) this
   renders whenever someone clears the field, not just for legacy records. Confirm
   or change.
3. **`QuickTrackSheet` empty-state copy** still says "Nothing scheduled for today"
   while the sheet can now be parked on another day. Left alone on purpose — spec 01
   forbids copy changes. One line for spec 07.

### Then
- **Spec 05 · step 9 — device-test the adjust step on iOS Safari and Android
  Chrome.** Pinch-zoom inside an installed PWA is the likeliest place it breaks and
  can't be verified from here. The preview on PR #61 is the surface to test on.
- **Decide the re-add consistency question** (raised by CodeRabbit, deliberately
  unfixed): `resolveScheduleOn` gives every historical version the compound's
  CURRENT `startDate`, so after a re-add the pre-deletion run stops counting as
  "due" and drops out of consistency. Three options — leave it, anchor to the
  earliest version's `effectiveFrom` (which makes the deleted gap read as missed
  doses), or record a stopped/restarted marker (accurate, a few hours). Pre-existing
  behaviour: the old Reactivate re-anchored the start date the same way.
- Verify against the real DB once the MCP session is authorised: the
  `dose_times = ARRAY[NULL]` round-trip, and a version round-trip after 005 runs.
- Device-check the spec-02 re-add on a compound with real history (delete → search →
  plus → fresh dose/schedule → old logged doses still in the calendar).
- STAND BY. Do not merge to main until every wave-2 spec is done and approved.

---

## ▶ Open / non-urgent

- **Restyle — on-device eyeball of the amber judgment calls** (all shipped, each
  reversible in a follow-up if it doesn't land):
  - iOS install-prompt steps now use plain **mono numerals** — the Share/Plus
    glyphs were dropped. The one most worth a look (the Share glyph helps people
    find the iOS Share button).
  - **Warning callouts** kept amber (blend-overlap, dose-change, recon safety
    disclaimer, the soft-delete confirm's solid-amber button) + the LogDose
    **live clock** — keep, or move to `--state-warning` / white?
  - Buttons one notch lighter app-wide (`font-semibold`→`font-medium`); month
    headers demoted to eyebrows (Weight / journal / photo galleries).

- **Pre-launch legal copy** — 3 items parked verbatim in the Privacy Policy,
  awaiting Adrian's direction (see progress-tracker → Open Questions): §7
  backup-retention window (unconfirmed), §9 regional-law compliance clause (needs
  legal sign-off), §5/§10 name the Supabase + Vercel regions.

- **Supabase dashboard — leaked-password protection** (HaveIBeenPwned) + min
  password length ≥ 8 (Authentication → Attack Protection / Email). Small hardening
  toggle flagged across earlier specs; confirm it's on.

- **Known QA gap (non-blocking):** the per-dose-draw `iu` path (Spec 21) has zero
  production coverage — all live inventory is `mg`. Test once a real HGH/hCG (`iu`)
  vial exists (`2iu @ 20iu/mL → 10u (0.1 mL)`).

Device QA for the other shipped features (Spec 19 female bodies, Spec 21 draw,
Spec 22 markers/photos) is non-blocking — they're live and working.
