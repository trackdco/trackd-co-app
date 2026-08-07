# Feature Specs — the index

**Everything in here is SHIPPED.** These are the build briefs the app was written
from, kept as the record of *why* each decision went the way it did. The code is
the truth; this folder is the reasoning behind it.

**None of these are auto-read.** `CLAUDE.md` mandates seven files at the top of
`Context/`, and none of them are in here — so this folder costs a session nothing
until something actually cites it. That is why it is cheap to keep.

Flattened 2026-08-07 from `Wave 1 - Beta/`, `wave 2 - refinement/part one|two/`
and `proposals/` into one folder. **The flattening repaired references rather
than breaking them:** ~15 SQL migrations and source comments already cited flat
paths like `Context/Feature Specs/08-Home-page-fixes-v1.md`, because these specs
were flat originally and the wave folders came later. Those citations resolve
again now.

## Naming

| Prefix | Wave | Numbers |
|---|---|---|
| *(bare)* `01-`…`22-` | Wave 1 — Beta | original numbers, unchanged, because SQL + source cite them |
| `w2a-` | Wave 2 refinement, part one | original 00–07 |
| `w2b-` | Wave 2 refinement, part two | original 00–11, plus 12 (Blocks) |

Wave 2 keeps a prefix because both waves number from `01` and the docs say things
like "Spec 01" meaning either. When a doc says **Spec 01** in a Wave 2 context it
means `w2a-01-dose-integrity.md`; in a Wave 1 context, `01-design-system.md`.

## Wave 1 — Beta

| # | Spec | Note |
|---|---|---|
| 01 | design-system | cited by `ui-context.md` |
| 02 | Bottom-nav-bar-Creation | |
| 03 | shortcuts-control-creation | |
| 04 | homepage | |
| 05 | compund-rotation-mechanics | *(sic — original filename typo, kept so citations resolve)* |
| 07 | scale-trend-weight-fix | cited by `supabase/profile/002` |
| 08 | Home-page-fixes-v1 | cited by 4 migrations + 2 server actions. Had a trailing space in its filename until 2026-08-07 |
| 09 | progress-page | |
| 10 | calendar-screen | |
| 11 | protocol-page | |
| 12 | Legal-Direction-Spec | had no `.md` extension until 2026-08-07 |
| 13 | extra-final-touches | |
| 14 | push-notifications | |
| 15 | cycle-id-stamping | cited by `supabase/cycles/001` |
| 16 | tier-column-lock | cited by `supabase/grants/003` — the `profiles.tier` rule |
| 17 | supabase-advisor-hardening | cited by `supabase/hardening/001` |
| 18 | build-order-snapshot-2026-07-02 | **was `18-SPEC_INDEX.md`.** Not an index — a stale planning snapshot on its OWN numbering, where "02" means the file numbered 15. Renamed so it stops being mistaken for this file |
| 19 | SiteRotation-Rework | the original site spec; had no `.md` until 2026-08-07 |
| 19 | body-svg-integration | supersedes the above. Two files share `19-` on purpose |
| 20 | Navbar-revised | |
| 21 | dosage-units-view | |
| 22 | multi-spec-fixes | |

There is **no 06** — the gap is original, not a lost file.

## Wave 2 — refinement, part one (`w2a-`)

`00-README` · 01 dose-integrity · 02 compound-lifecycle · 03 add-compound ·
04 markers-by-sex · 05 photo-adjust · 06 admin · 07 global-sweep

## Wave 2 — refinement, part two (`w2b-`)

`00-README` · 01 containers · 02 homepage · 03 calendar · 04 protocol ·
05 stacks · 06 cycles · 07 calculator · 08 progress · 09 profile ·
10 add-compound-item · 11 log-a-dose · **12 blocks**

`w2b-12-blocks.md` was `proposals/blocks.md`. Blocks arrived as a proposal
mid-wave and shipped, so it joins the run it was built in.

## `svgs/` — the one folder that is NOT archive

**Live source art. Do not treat this as history.**

- `body-svg/male|female/*.svg` — Angus's region artwork. `scripts/gen-female-body-art.py`
  **reads the `female/` set** to generate `components/sites/bodyArtworkFemale{IM,SubQ}.ts`.
  Delete these and the female body map cannot be regenerated. (The male modules were
  generated ad-hoc before that script existed and have no equivalent.)
- `body-svg/_verify/*.png` — verification renders from the Spec 19 build.
  Genuinely disposable; kept only because Spec 19 cites them.
- `containers-svg.svg/` — syringe + container source art.
