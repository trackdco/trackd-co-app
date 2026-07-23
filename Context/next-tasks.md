# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-23

---

## 🎯 Current focus

**Wave 2 · Spec 01 — Dose & Schedule Integrity.** Steps 1–4 and 6–8 are BUILT on a
branch (not merged, not deployed). Step 5 (schedule versioning) is blocked on a
migration decision.

### Blocked on Adrian
1. **Schedule versioning (step 5) — needs a migration and sign-off.** Altering a
   compound still mutates its single schedule row, so past due-sets (week-strip
   dots, calendar cells) re-derive from the new rule. Fixing it properly means a
   `protocol_compound_schedules` table + a per-date resolver. The spec itself says
   to present the plan before running the migration. Past logged doses are already
   safe — the outstanding half is what the app says *was due*.
2. **Placeholder wording for an unset time** — currently **"Not set"**, worded once
   in `formatTimeLabel`. Confirm or change.
3. **Calendar logging** — the checklist wants a past-day log from the calendar, but
   the Calendar is read-only by design. The date plumbing is ready; the flow is not
   built (reads like spec 09/10 work).
4. **`QuickTrackSheet` empty-state copy** still says "Nothing scheduled for today"
   while the sheet can now be parked on another day. Left alone on purpose — spec 01
   forbids copy changes. One line for spec 07.

### Then
- Deploy to a Vercel **preview** subdomain and device-test (spec 01's last step).
- Verify the unset-time path against the real DB — `dose_times = ARRAY[NULL]`
  round-trip couldn't be checked locally (Supabase MCP token expired).
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
