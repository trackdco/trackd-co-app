# Container Components

## Goal
Build the shared set of drawn container components that every later spec depends on. Three components cover the whole app: a vial for injectables, a bottle for tablets and capsules, and a tub for powders. Each takes a colour and a fill level and renders as SVG, so it tints to any category or stack colour, stays sharp at every size, and animates its fill natively.

These are drawn, not photographed. That is deliberate. A photograph cannot be tinted per compound, cannot animate a fill level, and does not scale. The raw SVG source is included below and is the approved artwork, so this spec is mostly about wiring it up rather than designing it.

**This is the first part-two spec.** Homepage, Protocol, Progress, add-compound and log-a-dose all render containers. Build this first or they will each invent their own.

## Out of Scope
- Do NOT source, generate, or use photographic vial imagery anywhere.
- Do NOT define any new colours. Containers pull from the existing category colour coding already in the codebase.
- Do NOT build storage tracking for tablets or powders. Only vials track fill. See Fill behaviour below.
- Do NOT place these components on any screen yet. Later specs do that.
- Do NOT change the existing small category icons used in the dashboard log list. Those stay exactly as they are.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Component selection is driven by form, not category.**
- Liquid renders a vial. Tablets and capsules render a bottle. Powder renders a tub.
- This is the same rule that gates the stock section in `03-add-compound.md`. Keep them consistent, and if that spec introduced a shared helper for reading a compound's form, reuse it rather than writing a second one.
- A future oral anabolic must render a bottle without any special-casing.

**Colour.**
- Default to the compound's category colour, exactly as the current icons do.
- When a compound belongs to a stack, the stack's chosen colour overrides the category colour. This is what produces a row of matching containers on a stack card.
- A custom compound with no category set falls back to a neutral stone grey. Do not invent a fifth category colour.

**Fill behaviour.**
- Vials take a real fill percentage derived from remaining volume against the vial's total.
- Bottles and tubs have no storage tracking yet, so they render at a **fixed illustrative fill** and the surrounding card must suppress any percentage bar, doses-remaining figure, or runs-dry date. We never imply a number we do not have.
- The fill is a prop on every container regardless, so when tablet or powder counts arrive later the artwork goes live with no rework.

**Animation on log.**
- When a dose is logged, the fill level drops by one dose worth over roughly 400ms with an ease-out, then settles. No bounce, no overshoot, consistent with the restraint rules in `ui-context.md`.
- Logging a stack animates every member container together in a single motion.
- Respect `prefers-reduced-motion`. When set, the fill jumps to its new level without animating.

**Sizing.** Each component takes a size and scales from its viewBox. Do not build separate small and large variants.

## Approved SVG source

Use this artwork as-is. `{COLOUR}` is the resolved container colour and `{COLOUR_LIGHT}` is that colour lightened for the meniscus, which you can compute rather than store.

**Vial** (viewBox `0 0 60 96`). Liquid sits between y=22 at full and y=86.5 at empty, so height = `64.5 * fill` and y = `86.5 - height`.

```svg
<svg viewBox="0 0 60 96" xmlns="http://www.w3.org/2000/svg">
  <rect x="19" y="2" width="22" height="13" rx="2.5" fill="#2e2e2b"/>
  <rect x="21.5" y="13" width="17" height="5" rx="1" fill="#3d3d39"/>
  <rect x="14" y="17" width="32" height="72" rx="5" fill="#1f1f1d"/>
  <rect x="16.5" y="{FILL_Y}" width="27" height="{FILL_H}" rx="3.5" fill="{COLOUR}"/>
  <rect x="16.5" y="{FILL_Y}" width="27" height="7" rx="3" fill="{COLOUR_LIGHT}"/>
  <rect x="19" y="22" width="3.5" height="60" rx="1.75" fill="#ffffff" opacity="0.07"/>
  <rect x="14" y="17" width="32" height="72" rx="5" fill="none" stroke="#3a3a37" stroke-width="1"/>
</svg>
```

**Bottle** (viewBox `0 0 60 96`). Tablets and capsules are a fixed decorative arrangement until counts exist.

```svg
<svg viewBox="0 0 60 96" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="2" width="24" height="12" rx="2.5" fill="#2e2e2b"/>
  <rect x="23" y="12" width="18" height="5" rx="1" fill="#3d3d39"/>
  <rect x="14" y="16" width="36" height="77" rx="7" fill="#1c1c1a"/>
  <rect x="14" y="34" width="36" height="30" rx="1" fill="#232320"/>
  <g>
    <rect x="19" y="70" width="15" height="7" rx="3.5" fill="{COLOUR}" transform="rotate(-12 26.5 73.5)"/>
    <rect x="32" y="76" width="15" height="7" rx="3.5" fill="{COLOUR_LIGHT}" transform="rotate(9 39.5 79.5)"/>
    <rect x="18" y="80" width="15" height="7" rx="3.5" fill="{COLOUR}" transform="rotate(6 25.5 83.5)"/>
    <circle cx="41" cy="68" r="4.5" fill="{COLOUR_LIGHT}"/>
    <circle cx="24" cy="62" r="4.5" fill="{COLOUR}"/>
    <circle cx="36" cy="58" r="4.5" fill="{COLOUR_LIGHT}"/>
  </g>
  <rect x="17.5" y="22" width="3.5" height="64" rx="1.75" fill="#ffffff" opacity="0.06"/>
  <rect x="14" y="16" width="36" height="77" rx="7" fill="none" stroke="#3a3a37" stroke-width="1"/>
</svg>
```

**Tub** (viewBox `0 0 64 100`). Wide creatine-style body with an oversized screw lid and an elliptical rim.

```svg
<svg viewBox="0 0 64 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="16" width="52" height="17" rx="6" fill="#33332f"/>
  <ellipse cx="32" cy="16.5" rx="26" ry="5" fill="#3d3d39"/>
  <rect x="9" y="31" width="46" height="60" rx="7" fill="#1c1c1a"/>
  <ellipse cx="32" cy="31.5" rx="23" ry="4.5" fill="#232320"/>
  <path d="M11.5 56 h41 v31 a5 5 0 0 1 -5 5 h-31 a5 5 0 0 1 -5 -5 z" fill="{COLOUR}"/>
  <ellipse cx="32" cy="56" rx="20.5" ry="4" fill="{COLOUR_LIGHT}"/>
  <rect x="9" y="60" width="46" height="17" rx="1" fill="#0d0d0c" opacity="0.22"/>
  <rect x="13" y="38" width="3.5" height="48" rx="1.75" fill="#ffffff" opacity="0.06"/>
  <rect x="9" y="31" width="46" height="60" rx="7" fill="none" stroke="#3a3a37" stroke-width="1"/>
</svg>
```

The greys above are structural (glass, cap, outline) and should come from `ui-context.md` tokens rather than being hardcoded. If no matching token exists, flag it before inventing one.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Flag this as a new shared component set and get approval before creating it, per our standing rule.
2. Map every structural grey in the artwork above to an existing `ui-context.md` token. Report any that have no match rather than hardcoding.
3. Build the vial component taking colour, fill and size. Verify the liquid geometry at 0%, 50% and 100%.
4. Build the bottle and tub components with the same interface.
5. Build the form-to-component resolver, reusing the form helper from `03-add-compound.md` if one exists.
6. Build the colour resolver: category colour by default, stack colour when the compound is in a stack, stone grey when no category is set.
7. Add the fill animation with the reduced-motion fallback.
8. Render a temporary internal page showing all three at several fill levels and every category colour, so we can review them together. Remove it before merge.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Shared component set flagged and approved before creation
- [ ] Structural greys mapped to `ui-context.md` tokens, unmatched ones reported
- [ ] Vial, bottle and tub built from the approved SVG source above
- [ ] Each takes colour, fill and size through the same interface
- [ ] Vial liquid geometry correct at 0%, 50% and 100%
- [ ] Component chosen by the compound's form, not its category
- [ ] Form helper from `03-add-compound.md` reused rather than duplicated
- [ ] Category colour applied by default
- [ ] Stack colour overrides category colour for stack members
- [ ] Custom compound with no category falls back to stone grey
- [ ] No new colours defined
- [ ] Bottles and tubs render at a fixed fill with no real storage number implied
- [ ] Fill drops with a 400ms ease-out on log, no bounce
- [ ] `prefers-reduced-motion` skips the animation
- [ ] Existing small category icons in the dashboard log list unchanged
- [ ] No photographic imagery introduced
- [ ] Review page removed before merge
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)