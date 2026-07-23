# Spec 19 — Body SVG Integration (handoff)

> **Purpose.** Angus hand-made anatomical **body SVG** artwork to replace the
> placeholder silhouette in the injection-site body map. This doc is the
> self-contained brief for a fresh chat to integrate it. **Do intramuscular (IM)
> first**; subcutaneous (Sub-Q) comes later once IM is confirmed working.

## 0. Read first (in this order)
1. The standing context files (`CLAUDE.md` loads them): `Context/architecture.md`,
   `Context/ui-context.md`, `Context/code-standards.md`, `Context/ai-workflow-rules.md`,
   `Context/progress-tracker.md`, `Context/next-tasks.md`.
2. In `architecture.md`, the **"Injection Sites (Spec 19)"** section — it summarises
   the whole feature (Steps 1–4, all built) and the current state.
3. The original spec: `Context/Feature Specs/19-SiteRotation-Rework`.
4. Memory `angus-body-svg` — the standing note that this SVG is coming.

## 1. The task, in one line
Swap the hand-authored placeholder silhouette in
**`components/sites/BodySilhouette.tsx`** for Angus's uploaded anatomical SVG(s),
keeping the shared `BodyMap` and the 0–100 coordinate grid intact, so the injection
site markers still land on the anatomy. **IM now, Sub-Q later.**

## 2. Where the SVG files are
Angus will save the IM artwork in the repo (confirm the exact paths in his prompt —
likely `Context/Feature Specs/body-svg/im-front.svg` + `im-back.svg`, or he may paste
them). Front (anterior) + back (posterior) are two separate SVGs.

## 3. The architecture you're plugging into (do NOT redesign it)
- **`components/sites/BodySilhouette.tsx`** — THE SWAP POINT. Pure SVG, no state.
  Currently exports `<BodySilhouette aspect="anterior" | "posterior" />` returning an
  SVG `<g>` (body masses + muscle contour lines) drawn in a `0 0 100 100` viewBox.
  It's rendered INSIDE a parent `<svg viewBox="0 0 100 100">`; the parent plots the
  markers on top. **This is the only file you must change to swap the body.**
- **`components/sites/BodyMap.tsx`** — the SHARED, presentational map. Renders the
  front + back silhouettes side by side and plots each site as a marker at its
  `(x, y)`. Three modes: `select` (setup), `pick` (log flow), `recency` (rotation).
  **Do not change its public API.** It renders `<BodySilhouette>` then the markers,
  so the silhouette naturally sits UNDER the markers.
- **`components/sites/SitesScreen.tsx`** — the `/settings/sites` screen (Set up /
  Rotation toggle). Consumes `BodyMap`. No change expected.
- **`components/home/LogDoseSheet.tsx`** — the dose-log flow renders `BodyMap` in
  `pick` mode. No change expected.
- **`supabase/sites/injection_sites.csv`** — the **36 sites** (22 IM + 14 Sub-Q) with
  their `x,y` coordinates on the 0–100 grid. If the new silhouette's proportions
  differ, re-tune the marker coords HERE, regenerate the seed
  (`node supabase/sites/build-sites-seed.mjs`), and apply the regenerated upsert as a
  **new** idempotent migration `supabase/sites/007_*.sql` (`ON CONFLICT (id) DO
  UPDATE` — same pattern as `002`/`005`; apply via the Supabase MCP `apply_migration`).
  Do NOT edit already-applied migration files.
- `lib/home/siteRecency.ts` — recency/decay maths. Not involved in the SVG swap.

## 4. The coordinate grid the markers use (align the SVG to this)
`0 0 100 100`, centreline **x = 50**, **viewer-facing** (on the FRONT/anterior view a
"Right" site sits left-of-centre; on the BACK/posterior view a "Right" site sits
right-of-centre). The 36 markers currently assume roughly:

| Landmark | y | Landmark | y |
|---|---|---|---|
| top of head | ~2 | waist | ~46 |
| head centre | ~8 | hips | ~53–55 |
| shoulders / delts | ~20 | knees | ~80 |
| chest / traps | ~19–27 | ankles/feet | ~93–95 |

Body width spans ~**x 26–74** (arms out to the hands at x≈25/75). If Angus's SVG
matches these proportions, the existing coords just work. If not, re-map the coords
in the CSV (see §3) — that's expected and fine.

## 5. Colour / fill (ui-context tokens — NO hardcoded hex)
- Body fill: **`--bg-input` (`#2A2A28`)** — a faint warm-grey on the `#1C1C1A`
  (`--bg-surface`) card. Deliberately low-contrast so the **amber markers** are the
  focus. Prefer `fill="currentColor"` / no baked fill so it's driven by the token.
- Muscle contour/detail lines: **`--border-strong` (`#3E3E3A`)**, subtle — ideally a
  separate group so they can be coloured independently.
- **Transparent background** (no background rect — the card shows through).
- Single flat fill; **no gradients, shadows, or 3D**. Do NOT include site markers or
  amber in the SVG — `BodyMap` draws those on top.

## 6. Integration steps
1. **Sanitise each SVG:** strip `width`/`height`, keep/normalise to `viewBox="0 0
   100 100"` (or record its real viewBox so coords can be mapped), remove any
   background rect, replace hardcoded body fills with `currentColor` (or the token),
   keep interior muscle lines as a distinct group.
2. **Wire into `BodySilhouette.tsx`:** render the front artwork for `aspect ===
   "anterior"`, back for `"posterior"`. Keep it a pure `<g>` (or nested `<svg>` with a
   matching viewBox) so the parent's marker coordinates still resolve to the same grid.
3. **Per-route artwork (decide with Angus):** the body is currently shared across IM
   and Sub-Q (same human outline). Angus is making IM art now and Sub-Q later, so he
   MAY want route-specific silhouettes (muscles for IM, fat/pinch zones for Sub-Q). If
   so, extend `BodySilhouette` to also accept a `route` and pass it from `BodyMap`
   (which knows the route from its `sites`); wire IM now and keep the current
   placeholder for Sub-Q until that art lands. If he wants ONE shared body, ignore
   this. **Ask him if unclear — don't guess.**
4. **Keep the marker layer on top** (BodyMap already renders silhouette → markers).

## 7. Verify (this is important — you can't see it otherwise)
Render the silhouette + all 36 markers to a PNG with `sharp` (already a dependency)
and LOOK at it, to confirm each marker lands on the right body region. Pattern (adapt
paths; run from repo root so `sharp` resolves):

```js
// scratch render: build an SVG string = <the sanitised silhouette> + a <circle>
// per row of supabase/sites/injection_sites.csv at (x,y) coloured amber #C8861A,
// front=anterior / back=posterior side by side, then:
import sharp from "sharp";
await sharp(Buffer.from(svgString)).png().toFile("check.png");
// then Read check.png to eyeball marker placement; nudge CSV coords until they sit
// on the anatomy; re-seed via a new migration.
```
(The previous chat used exactly this to verify the placeholder — see the
`recency-check` / `pick-check` renders it produced.)

Then: delete any stray `.next/* 2.*` files (macOS dupes trip tsc), and run
`npx tsc --noEmit`, `npm run lint`, `npm run build` — all must be clean.

## 8. Scope / rules
- **IM only** this pass; Sub-Q after Angus confirms IM works.
- **Don't commit/deploy** unless Angus says so — the whole Spec 19 feature is built
  but still local/uncommitted (migrations 001–006 ARE already applied to the live DB
  via MCP). Deploy is Angus's call (push to main → Vercel prod).
- Dark-only app; **tokens only, no hardcoded hex** outside `app/globals.css`.
- Update `progress-tracker.md` + this doc when done.

## 9. Quick sanity checklist when done
- [x] Front + back IM silhouette render from Angus's SVG (placeholder gone for IM).
- [x] All IM markers land on the correct body region (verified by a PNG render).
- [x] Body fill is the token (`--bg-input`), transparent bg, markers still amber + on top.
- [x] `tsc` + `lint` + `build` clean; no coords broke the log/rotation/setup views.
- [x] Sub-Q left as-is (placeholder) pending its artwork.

## 10. As-built (2026-07-15)
Done, IM only. Files: **`components/sites/bodyArtworkIM.ts`** (new — generated path
data + `IM_ART_TRANSFORM`), **`BodySilhouette.tsx`** (route-aware: `im` → Angus's art,
else placeholder), **`BodyMap.tsx`** (derives route from sites; NEW Front/Back pill
toggle + sliding `translateX` transition, replacing the side-by-side layout),
**`injection_sites.csv`** + regenerated `002` + migrations
**`007_retune_im_coords_body_svg.sql`** (centroids) and
**`008_respace_crowded_im_markers.sql`** (both APPLIED LIVE via MCP).

Key facts for the next chat:
- Angus's SVGs are native `viewBox="0 0 1491 2109"`; front + back are registered (same
  frame), so ONE transform maps both onto the 0–100 grid. Do the same for Sub-Q art.
- Angus labels muscle groups by **image side** (`_l` = left of image = viewer-left),
  NOT anatomical side — assign marker coords by position (viewer-facing convention),
  not by trusting the `_l`/`_r` label. Muscle centroids were measured with `sharp`+trim.
- **Ventroglute now renders on the FRONT** (anterior) — Angus drew `ventroglute_l/r` in
  `im_front.svg`; the catalogue `aspect` was flipped to match (dose-log enum unaffected).
- Verification renders: `Context/Feature Specs/body-svg/_verify/` (labeled front/back,
  as-shown map, pill-toggle layout).
- **Marker spacing constraint:** the map's tap target is `r=7` on the 0–100 grid, so two
  sites closer than ~8 units make one dot fall inside the other's (later-painted) hit
  disc → untappable. 007's exact centroids did this to Outer-Quad/Front-Quad & Tricep/Lat;
  `008` re-spaced them. Keep any new (incl. Sub-Q) coords ≥~8 apart per view.
- **Sub-Q next:** drop `subq-front.svg`/`subq-back.svg`, generate a `bodyArtworkSubQ`
  module the same way, extend `BodySilhouette` to pick art per route, re-tune the 14
  Sub-Q coords to that art (mind the ≥~8-unit spacing), migration `009`. The pill toggle
  already handles it.
- NOT committed / pushed to Vercel — Angus's call.
