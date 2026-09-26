/**
 * Shared className presets for the premium-minimal card chrome (see
 * `Context/ui-context.md` → Typography). They keep every screen one consistent
 * system instead of each card / sheet / page re-deriving its own title + value
 * styles. The identity is an INVERSION: card TITLES recede into small
 * tracked-uppercase eyebrows, and the DATA VALUE is the display layer (large,
 * light, mono).
 *
 * Apply these rather than hand-writing the classes, so a future tweak is one
 * edit. Pure strings — no React, safe to import anywhere.
 *
 * (The old serif `CARD_TITLE` + amber `*_ICON_BADGE` presets were retired with the
 * restyle — cards lead with their `CARD_EYEBROW`, not a serif heading or an icon
 * badge; see ui-context.md → "Icon badges are retired".)
 */

/** Standalone screen page title + the Home greeting — sans, light, tightly tracked.
 *  Settings, Weight, Billing, Profile `<h1>`, and "Good morning, …". */
export const PAGE_TITLE =
  "text-2xl font-light tracking-[-0.02em] text-foreground"

/** Bottom-sheet header (Add photos, Journal, Edit cycle, …) — sans, light, tightly
 *  tracked. One notch smaller than PAGE_TITLE. */
/**
 * Emphasis on the two or three words a full-screen flow headline actually turns
 * on ("the more you see", "the cheap part"). Used as
 * `<em className={FLOW_EMPHASIS}>`, so the emphasis is in the markup and not
 * only in the paint.
 *
 * Geist Medium (500) AND italic. Weight alone was not enough at 32px on a dark
 * canvas: the step from Light to Medium is visible in a paragraph and almost
 * invisible in a headline, so the slant does most of the work and the weight
 * stops it reading as a quotation. Still 500, never 600+.
 *
 * A preset rather than a literal because the flow already carries three other
 * emphasis treatments; see `ui-context.md` → Typography for which and why.
 */
export const FLOW_EMPHASIS = "font-medium"

export const SHEET_TITLE =
  "text-xl font-light tracking-[-0.01em] text-foreground"

/** The headline on a FULL-SCREEN EXTERNAL FLOW — sign-in and onboarding. One
 *  notch ABOVE `PAGE_TITLE`, because these screens carry a single headline on an
 *  otherwise empty field rather than titling a page of data. Codifies the
 *  treatment `/login` already shipped, so the onboarding flow could not drift
 *  into a second one. Still Geist Light: the hierarchy is size and weight, never
 *  a second typeface (the display serif is retired). */
export const FLOW_TITLE =
  "text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground"

/** The supporting line under a `FLOW_TITLE`. */
export const FLOW_SUB = "text-[0.95rem] leading-relaxed text-text-muted"

/** The MOMENT screens in a flow — celebrate, welcome, the cost statement.
 *  One notch above `FLOW_TITLE` and tracked tighter, so the line reads as a
 *  statement rather than a page title. Reserved for a screen carrying a single
 *  sentence and nothing else; a screen with a form under it uses `FLOW_TITLE`. */
export const FLOW_DISPLAY =
  "text-[2.5rem] font-light leading-[1.02] tracking-[-0.035em] text-foreground"

/**
 * The PUBLIC SITE's type (spec 3-02, re-cut for 3-03). Used on `/` and
 * `/reconstitution-calculator` and nowhere in the app.
 *
 * `LANDING_DISPLAY` is the hero headline. `FLOW_DISPLAY` is sized for a
 * phone-width flow screen; the landing page is also read on a laptop, where
 * that size reads as a paragraph rather than an opening statement, so this one
 * steps up at each breakpoint. Still Geist Light, still one `<em>` of emphasis
 * at most: the step is size, never a second typeface or a heavier weight.
 *
 * `LANDING_TITLE` heads each section; `LANDING_SUB` sits under it, in the
 * AA-safe `--text-secondary` because this page must measure, not just look.
 */
export const LANDING_DISPLAY =
  "text-[3rem] md:text-[4.25rem] lg:text-[4.75rem] font-light leading-[0.98] tracking-[-0.045em] text-foreground"

export const LANDING_TITLE =
  "text-[2.1rem] md:text-[2.9rem] font-light leading-[1.04] tracking-[-0.035em] text-foreground"

export const LANDING_SUB =
  "text-[0.98rem] md:text-[1.08rem] leading-relaxed text-text-secondary"

/* ---------------------------------------------------------------------------
   Inversion presets (see ui-context.md → Typography): card TITLES recede into
   small tracked-uppercase eyebrows, and the DATA VALUE becomes the display layer
   (large, light, mono).
   --------------------------------------------------------------------------- */

/** Card / section title — a small tracked-uppercase eyebrow, NOT a heading.
 *  The inversion (small titles, large values) IS the identity. */
export const CARD_EYEBROW =
  "text-[10px] font-sans font-medium uppercase tracking-[0.2em] text-text-muted inst-engraved"

/** Labels a metric value. It was one notch quieter than a card title, in
 *  `--text-subtle`; that is decoration-only, and a label is read (consistency
 *  fix #3), so it now matches the eyebrow's muted and stays quieter by size. */
export const METRIC_LABEL =
  "text-[10px] font-sans font-medium uppercase tracking-[0.2em] text-text-muted inst-engraved"

/** Eyebrow for a NARROW column — a third-width card in a row of three, where the
 *  10px eyebrow's 0.18em tracking pushes a single long word ("CONCENTRATION",
 *  ~109px) past the column and there is no space to wrap on. Same uppercase
 *  eyebrow identity, one notch down in size and tracking so it fits. Use it only
 *  where the column is genuinely too narrow for CARD_EYEBROW; a full-width card
 *  title is always CARD_EYEBROW. */
export const COLUMN_EYEBROW =
  "text-[9px] font-sans font-medium uppercase tracking-[0.12em] text-text-muted inst-engraved"

/** The big number on metric / glance cards — the display layer. Light-weight
 *  mono, tightly tracked, tabular. Units/suffixes demote inline via UNIT_SUFFIX
 *  (e.g. 92▸%, 8:00▸pm) — never at value size. */
export const METRIC_VALUE =
  "font-mono text-[28px] font-light text-foreground inst-figure"

/** Demoted unit / suffix rendered inline beside a METRIC_VALUE. */
export const UNIT_SUFFIX = "text-sm text-text-muted"

/** Row-level data (doses, timestamps, counters) — right-aligned in list rows so
 *  figures rail vertically. Uppercase mono metadata (e.g. `L-DELT · 3D`) adds
 *  `tracking-[0.08em]`: tracked-out mono at small sizes is the instrument-panel
 *  detail; default spacing reads generic. */
export const DATA_MONO = "font-mono text-xs tabular-nums text-text-muted"

/** A row inside the Profile danger zone (spec 09 · part two) — Sign out, Clear
 *  all compounds, Delete my account. Red LABEL on an unfilled row; the boundary
 *  is the section's own outline, so the rows themselves stay quiet. A preset
 *  rather than three copies, because three copies of a destructive treatment is
 *  how one of them quietly stops matching the others. Never use it outside a
 *  bounded destructive section: `--accent-destructive` is scoped to deliberate
 *  destructive actions, not a general accent.
 *
 *  Its press is the shared `row` variant (feel pass §2); `danger-row` keeps the
 *  red pressed tint in place of the row's raised surface. The class names are
 *  literals because `PRESS` is declared further down this file. */
export const DANGER_ROW =
  "press-row danger-row flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-accent-destructive outline-none transition-colors hover:bg-accent-destructive/10 focus-visible:bg-accent-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/* ------------------------------------------------ stock entry (shared) --- */

/**
 * The stock form's field styling, shared by the two places you can enter it:
 * the "Stock on hand" panel inside Add-a-compound, and the standalone Add-stock
 * sheet (Adrian, 2026-08-07 — "make the stock thing the same layout").
 *
 * They were written months apart and drifted: uppercase tracked labels against
 * sentence-case ones, mono figures against proportional, `px-3 py-1.5` pills
 * against `px-2.5 py-1`. Same fields, same units, same task — so one definition.
 * Add-a-compound's version won, because it is the one most people meet first.
 */
/** Every field's label, in every form (consistency fix #19). */
export const FIELD_LABEL = "mb-1 block text-xs text-text-muted"
/** @deprecated The stock form's name for {@link FIELD_LABEL}. */
export const STOCK_FIELD_LABEL = FIELD_LABEL
/** Pair with the `Input` component, which supplies the base. */
export const STOCK_FIELD =
  "h-11 min-w-0 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input"
/** @deprecated Use CHIP / CHIP_ON / CHIP_OFF (fix #20). Kept as aliases. */
export const STOCK_PILL = "press-pill rounded-lg border px-2.5 py-1 text-sm transition-colors"
export const STOCK_PILL_ON = "border-transparent inst-thumb font-medium text-bg-base"
export const STOCK_PILL_OFF = "border-border-default bg-bg-input text-text-muted hover:text-text-primary"

/**
 * The app's primary confirm button — "Save", "Add to log", "Resume now".
 *
 * Written out per-sheet for a long time and drifting by a class or two each
 * place; the Pause sheet's was missing both the press-scale and any disabled
 * state, so a button with nothing to do looked identical to one that would act
 * (Adrian, 2026-08-07). Width is left to the caller: some are full-width, some
 * share a row.
 *
 * `--accent-primary` on `--bg-base` text, not a colour of its own — see
 * `ui-context.md`.
 *
 * Its press is the shared system's `button` variant (feel pass §2). It carried
 * `active:scale-[0.99]`, which SNAPPED: only opacity was transitioned, and iOS
 * applies `:active` too late for a quick tap to show it at all.
 */
export const PRIMARY_BUTTON =
  "press-button inst-btn flex min-h-11 items-center justify-center gap-2 px-4 py-3 " +
  "text-sm font-medium text-bg-base transition-opacity hover:opacity-90 " +
  "disabled:pointer-events-none disabled:opacity-50"

/* ------------------------------------------------ the Instrument look --- */

/**
 * THE INSTRUMENT SURFACES (Adrian, final check round three, 2026-09-25;
 * build-brief-final §2.3). One class each; the surface itself (radius, fill,
 * the machined shadows) lives in `globals.css` so a retune is one edit.
 * Reach for these rather than writing `rounded-2xl bg-bg-surface` by hand:
 * a hand-written card is how the drop shadow and the lit edge go missing.
 */

/** A card: radius 20, the surface, a lit top edge and a soft drop below. */
export const CARD = "inst-card"

/** A block of rows inside a card or a sheet: radius 12, raised, dark dividers. */
export const ROWS = "inst-rows"

/** The quiet button beside a white one (Cancel, Edit, Mix one). Radius 9. */
export const GHOST_BUTTON =
  "press-button inst-ghost flex min-h-11 items-center justify-center gap-2 px-4 py-3 " +
  "text-sm font-medium text-text-primary transition-opacity hover:opacity-90 " +
  "disabled:pointer-events-none disabled:opacity-50"

/** Every Cancel / Go back beside a white button (consistency fix #2). In the
 *  Instrument look it IS the ghost button. */
export const SECONDARY_BUTTON = GHOST_BUTTON

/** A white action INSIDE a row or card ("Mix one", "Add stock"): the primary
 *  button at a row's size. */
export const PRIMARY_PILL =
  "press-button inst-btn inline-flex min-h-9 items-center justify-center gap-1.5 px-4 py-2 " +
  "text-[13px] font-medium text-bg-base disabled:pointer-events-none disabled:opacity-50"

/**
 * A HIT AREA of at least 44 × 44 around a smaller drawing (Apple's floor; cold
 * review D8). A transparent `::before` reaches past the drawing on every side,
 * so what is drawn does not change and nothing moves. Pick the one for the
 * drawing's size, and leave at least that reach of room to the next control so
 * the two never overlap. The element must be positioned: these carry
 * `relative`, and a caller's own `absolute` wins through `cn()`. Inside a
 * scroll or `overflow-hidden` box the reach is clipped at its edge, so give it
 * room there (TypeRail does).
 *
 * - `HIT_26`: a 26px drawing (the circled "?" beside a title), 9px out.
 * - `HIT_30`: a 30px drawing (the close arrow), 7px out.
 * - `HIT_34`: a 34px drawing (the "+" at a header's top right), 5px out.
 * - `HIT_Y_30`: a control 30px tall and wider than 44 (a type chip), 7px
 *   above and below only, so side-by-side chips never overlap.
 * - `HIT_Y_25`: a card-header switch's choice, 25px tall (`SEGMENTED_ITEM`:
 *   Cycles' 1M / 3M / 1Y / All), 10px above and below only.
 * - `HIT_Y_36`: a sheet switch's choice, 36px tall (`SEGMENTED_ITEM_LG`),
 *   4px above and below only.
 * - `HIT_Y_TEXT`: a word or two used as a button, one line of 11 to 13px
 *   type (a compound card's "Add stock", a footer's legal links), 16px above
 *   and below only. Links stacked closer than 32px apart must not take it.
 */
export const HIT_26 = "relative before:absolute before:-inset-[9px] before:content-['']"
export const HIT_30 = "relative before:absolute before:-inset-[7px] before:content-['']"
export const HIT_34 = "relative before:absolute before:-inset-[5px] before:content-['']"
export const HIT_Y_30 = "relative before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']"
export const HIT_Y_25 = "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']"
export const HIT_Y_36 = "relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
export const HIT_Y_TEXT = "relative before:absolute before:inset-x-0 before:-inset-y-4 before:content-['']"

/** The small "+" at a page's or sheet header's top right, and in a row: a
 *  rounded square, radius 10 (build-brief-final §2.4), drawn at 34px with a
 *  44px hit area (`HIT_34`). */
export const ADD_ACTION =
  "press-button inst-btn flex h-[34px] w-[34px] shrink-0 items-center justify-center text-bg-base " +
  HIT_34

/** A choice among a few (mg / mcg, a unit, a pose), not on a rail: rounded
 *  rectangles, outlined off, white on (consistency fix #20). */
export const CHIP =
  "press-pill inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
export const CHIP_ON = "border-transparent inst-thumb font-medium text-bg-base"
export const CHIP_OFF = "border-border-default text-text-muted hover:text-text-primary"

/** Two to four choices side by side: the rail and its sliding thumb
 *  (ThumbGroup). Card-header size, and a sheet size. A label never breaks
 *  inside itself ("Sub-" / "Q" at the hyphen; cold review D7). Each choice is
 *  pressed at 44 tall, drawn as before (D8): the card-header size reaches 7px
 *  past its rail above and below, the sheet size 1px. */
export const SEGMENTED_TRACK = "inst-rail flex p-[3px]"
export const SEGMENTED_ITEM =
  "press-pill flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1 text-[11.5px] transition-colors duration-300 " +
  HIT_Y_25
export const SEGMENTED_ITEM_LG =
  "press-pill flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-2 text-sm transition-colors duration-300 " +
  HIT_Y_36

/** A warning or note inside a sheet: a muted line, at most one amber glyph,
 *  no box (consistency fix #27). */
export const INLINE_NOTE = "flex items-start gap-2 text-[12.5px] leading-snug text-text-muted"

/** A list row's name, its mono metadata line, and a tile's label (fix #15). */
export const ROW_NAME = "truncate text-[14px] text-foreground"
export const ROW_META = "font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted"
export const TILE_LABEL = "text-[11px] text-text-muted"

/** The chevron on a row that GOES somewhere (fix #11). An icon, so subtle. */
export const ROW_CHEVRON = "h-4 w-4 shrink-0 text-text-subtle"

/**
 * THE ONE CLOSE ARROW's frame (`components/feel/CloseArrow.tsx`): a 30px
 * rounded square (radius 9) on the ghost surface, with a 44px hit area.
 */
export const CLOSE_ARROW =
  "close-arrow inst-ghost flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-foreground " +
  HIT_30

/** Corners INSIDE a card: never rounder than the card (fix #9). */
export const INNER_RADIUS = "rounded-xl"

/** A chip rail or switch track, and the thumb that slides in it. */
export const CHIP_RAIL = "inst-rail"
export const CHIP_THUMB = "inst-thumb"

/** A tile (Site / Stock / Note, Markers / Photos / Date). Radius 12. */
export const TILE = "inst-tile"

/** A graph well, or the panel a tile opens into. Radius 12, darker at the top. */
export const INSET = "inst-inset"

/** A big figure: Plex Mono, tabular, slashed zero, engraved. */
export const FIGURE = "font-mono inst-figure"

/**
 * IN-PLACE EDITING — the committed-state action bar (Adrian, 2026-09-03).
 *
 * A card edited in place pins its Save across the bottom of the screen, over the
 * tab bar, and moves Cancel into the section header where Edit sits. The full
 * argument (and the `.edit-action-bar` / `.grow-field` classes these compose
 * with) is in `globals.css` and `ui-context.md`; the short version is that
 * `PhysicalCard` used to SCROLL its Save row into view, which pushed every field
 * it was meant to reveal off the top of the screen.
 *
 * `EDIT_BAR` carries the fixed position, the blur, the safe-area inset and the
 * slide-up; the button inside it is `PRIMARY_BUTTON` at full width, so there is
 * no second confirm-button treatment in the app.
 */
export const EDIT_BAR = "edit-action-bar"
export const EDIT_BAR_SAVE = `${PRIMARY_BUTTON} w-full`

/**
 * The section-header control that opens and closes an in-place edit. One
 * position, two labels: "Edit" when closed, "Cancel" when open.
 *
 * 44px of target. It was 37x32 — the only sub-44 control on the Profile page,
 * and the one that gates the whole card. The negative margin keeps the visual
 * position unchanged.
 */
export const EDIT_TOGGLE =
  "-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-end whitespace-nowrap " +
  "rounded-md p-2 text-xs text-text-muted outline-none transition-colors " +
  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"

/**
 * Wraps ONE field in an in-place editor so its surface sweeps in from the right.
 * Set `--grow-i` inline to the field's index for the stagger.
 */
export const GROW_FIELD = "grow-field"

/**
 * The drop-up trigger — a sheet's secondary offer, as one quiet line.
 *
 * `CARD_EYEBROW`'s treatment (10px, tracked, uppercase, muted), because it is
 * the same small label every card title in the app already wears: it reads as a
 * heading you could open rather than a second button competing with Save.
 * Adrian chose it over a full row and a nearly-invisible link, 2026-09-11.
 *
 * ⚠️ `min-h-11` IS NOT OPTIONAL. The discretion is spent on the PAINT; the
 * target stays at Apple's 44px floor. Quiet to look at and small to hit are two
 * different decisions and only the first one was asked for. `EDIT_TOGGLE`
 * carries the same note for the same reason.
 *
 * ⚠️ `outline-none` MUST BE PAIRED WITH A RING, and the first version was not.
 *
 * It killed the outline and replaced it with `focus-visible:text-foreground` —
 * the same colour change hover already makes. A focus state indistinguishable
 * from hover tells a keyboard user nothing, and two review lenses flagged it
 * independently. Both refuters called it "not nothing" and let it pass; that is
 * true and beside the point, because the house pattern for this in
 * `EDIT_TOGGLE` is a real ring and there was no reason for this control to be
 * the exception. Offset against `--bg-surface`, since a sheet is where it lives.
 *
 * Used only through `components/layout/DropUp.tsx`, which owns the panel, the
 * caret and the motion. Do not hand-roll a second one.
 */
export const DROPUP_TRIGGER =
  "flex w-full min-h-11 items-center gap-2.5 rounded-md text-[10px] font-sans " +
  "uppercase tracking-[0.18em] text-text-muted outline-none transition-colors " +
  "hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-bg-surface"

/**
 * The tally beside a drop-up's label, shown only when non-zero.
 *
 * **Deliberately not amber.** Amber means "this needs you now"; a count of
 * photos already attached is a settled state, and settled reads white or muted
 * (ui-context → "amber marks what's live"). It brightens when the panel is
 * open, which is the whole of its emphasis.
 *
 * ⚠️ THE OPEN/CLOSED COLOUR IS APPLIED IN THE COMPONENT, NOT HERE.
 *
 * This carried `group-data-[dropup-open=true]:text-foreground`, which looked
 * correct and was never emitted: the rule did not appear in the generated
 * stylesheet at all, so the count sat muted forever and the one piece of
 * emphasis it has silently did nothing. Measured in a browser, not reasoned
 * about. `DropUp` now picks the colour with `cn()` from the same `open` prop
 * that drives everything else, which is how this codebase does state styling
 * everywhere else and does not depend on a variant being generated.
 */
export const DROPUP_COUNT =
  "shrink-0 font-mono text-[9px] tracking-[0.08em] transition-colors"

/* ------------------------------------------------------------ press (§2) --- */

/**
 * THE PRESS SYSTEM (feel pass, wave 3 §2). Add one of these to anything you can
 * tap and `components/feel/PressFeedback.tsx` gives it a visible press: held at
 * least 110ms, so a quick tap still lands; dropped at once on a scroll.
 *
 * - `card` / `button`: scale 0.97, opacity 0.85 (waits 45ms)
 * - `row`: scale 0.97 on a raised surface (waits 45ms). Parts of a row that
 *   should press the WHOLE row carry `PRESS.rowPart`; its tick keeps its own.
 * - `text` (Cancel, Track): opacity 0.45
 * - `icon`: scale 0.9 on a raised round backdrop
 * - `tick`: scale 0.86
 * - `tab`: scale 0.92, opacity 0.7
 * - `fab`: scale 0.92
 * - `day` (week strip): scale 0.92 on a raised surface (waits 45ms)
 * - `field`: scale 0.98
 * - `pill`: scale 0.94, opacity 0.8
 * - `key` (number pad): scale 0.95 on `--bg-input`
 *
 * Reduced motion keeps the dim and the surface and drops the scale. Never add
 * an `active:scale-*` beside one of these: `:active` is the thing this
 * replaces.
 */
export const PRESS = {
  card: "press-card",
  button: "press-button",
  row: "press-row",
  rowPart: "press-row-part",
  text: "press-text",
  icon: "press-icon",
  tick: "press-tick",
  tab: "press-tab",
  fab: "press-fab",
  day: "press-day",
  field: "press-field",
  pill: "press-pill",
  key: "press-key",
} as const

/**
 * A section of a bottom sheet rising in as the sheet lands (feel pass §4).
 * Set `--rise-i` (0, 1, 2 …) inline for the 40ms stagger.
 */
export const SHEET_RISE = "animate-sheet-rise shrink-0"
