# Body SVG drop folder (Spec 19)

Angus's hand-made anatomical body silhouettes for the injection-site body map go
here. They get **inlined** into `components/sites/BodySilhouette.tsx` (not served as
static assets), so this folder is just the staging/source location.

**Expected files (intramuscular first, sub-Q later):**
- `im-front.svg` — the anterior (front) IM body view
- `im-back.svg` — the posterior (back) IM body view
- `subq-front.svg` / `subq-back.svg` — later, once IM is confirmed working

**Format** (see `Context/Feature Specs/19-body-svg-integration.md` for the full brief):
- `viewBox="0 0 100 100"` if possible (the marker coordinate grid); otherwise note
  the real viewBox so the coords can be mapped.
- Single flat fill, ideally `fill="currentColor"` (or `#2A2A28`); transparent
  background (no background rect); muscle-definition lines as a separate group.
- **No** site markers / amber baked in — the map draws those on top.
