# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-29

---

## 🎯 Current focus

**Wave 2 · Spec 01 — Dose & Schedule Integrity.** All 8 steps are now BUILT on a
branch (not merged, not deployed). Typecheck, lint and 37 tests are green. The one
thing standing between this and "done" is running the migration.

### Blocked on Adrian
1. **Run `supabase/protocol/005_protocol_compound_schedules.sql` — needs sign-off.**
   The migration plan the spec asked for, in one line: a `protocol_compound_schedules`
   table holding each version of a compound's dose + schedule with the day it took
   effect. **Strictly additive** — nothing existing is altered, moved or deleted, and
   there is NO backfill (a compound with no versions resolves exactly as it does
   today). Cascades from `protocol_compounds`, ships its own RLS + grants. The app
   already runs correctly without it: every sync call swallows `42P01` and keeps
   versions in the device store, so applying it only starts backing them up. Say go
   and it runs via the Supabase MCP.
2. **Placeholder wording for a legacy unset time** — currently **"Not set"**, worded
   once in `formatTimeLabel`. A time is now required at both entry points, so this
   only renders for records written before that. Confirm or change.
3. **`QuickTrackSheet` empty-state copy** still says "Nothing scheduled for today"
   while the sheet can now be parked on another day. Left alone on purpose — spec 01
   forbids copy changes. One line for spec 07.

### Then
- Commit the working tree (step 5 + calendar logging are uncommitted).
- Deploy to a Vercel **preview** subdomain and device-test (spec 01's last step).
- Verify against the real DB once the MCP session is authorised: the
  `dose_times = ARRAY[NULL]` round-trip, and a version round-trip after 005 runs.
- CodeRabbit review, then STAND BY. Do not merge to main until every wave-2 spec is
  done and approved.

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
