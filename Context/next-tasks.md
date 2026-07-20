# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-20

---

## 🎯 Current focus

**Nothing active.** The app is fully built and live on prod, and the whole
premium-minimal UI restyle shipped (PR #59 + polish #60). No build work is queued.

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
