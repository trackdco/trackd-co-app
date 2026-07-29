# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-29

---

## 🎯 Current focus

**Wave 2 part one is DONE and LIVE on prod.** Specs 01-07 plus the delete-gap fix
are merged to `main` (PR #61, merged 2026-07-29) and deployed. All three migrations
applied. Typecheck, lint, `next build` and 73 tests green; reviewed by CodeRabbit
(2 rounds) plus a structured self-review and a security pass.

**Next: wave 2 part two** — eleven specs in `Context/Feature Specs/wave 2 -
refinement/part two/`, starting with `00-readme-pt2.md` to work out the sequencing.
Not started; Adrian will say when.

### Verified on device by Adrian (2026-07-29)
Everything works EXCEPT rotation lock, which is the documented iOS limitation:
WebKit exposes no orientation-lock API to web pages, and the manifest's
`orientation` is not honoured for iOS home-screen apps. Accepted — the alternatives
were a rotate-message overlay (rejected: would trap anyone whose device is locked
to landscape for accessibility) or a CSS transform hack that breaks scrolling and
input focus. Android installed is genuinely locked.

### Still open (nothing blocking)
1. **Placeholder wording for an unset time** — currently **"Not set"**, worded once
   in `formatTimeLabel`. Since the pre-fill was restored this renders whenever
   someone clears the field, not just for legacy records. Confirm or change.
2. **`QuickTrackSheet` empty-state copy** still says "Nothing scheduled for today"
   while the sheet can be parked on another day. Missed by the spec-07 sweep
   because it reads correctly in isolation; it's the date-awareness that's wrong.
3. **Spec 06's blocked paths** were verified by reading the code and RLS policies,
   not by executing them. Two minutes with a throwaway account: `/admin` signed in
   as a non-founder should say "Founders only" with no data; signed out should show
   the sign-in screen.
4. **The `iu` per-dose-draw path (Spec 21)** still has zero production coverage —
   all live inventory is `mg`. Test when a real HGH/hCG vial exists.

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
