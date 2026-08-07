# Reconstitution Calculator

## Goal
The calculator's arithmetic works. This is a presentation rebuild: make the result readable at a glance on a syringe graphic, break the outputs into three clear figures, tidy the inputs into one sheet, and tuck the working away behind a disclosure.

The single most important change is the syringe graphic. A number in a text field is easy to misread. A filled barrel that matches the syringe in your hand is not.

Depends on nothing else in the overhaul and can be built in parallel.

## Out of Scope
- Do NOT change any calculation. The arithmetic is correct and must produce identical results before and after.
- Do NOT remove or reword the permanent disclaimer at the bottom of the page without asking us first. Treat it as legal copy.
- Do NOT add compound presets, saved calculations, or history. This stays a stateless calculator.
- Do NOT wire the calculator into logging or into a compound's stored data.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Page order, top to bottom.** Title, result figure, syringe graphic, three result cards, input sheet, view calculations, permanent disclaimer.

**First-run disclaimer.**
- A one-time modal the first time a user opens the calculator, explaining plainly that this is a calculator and not dosing advice.
- Dismissed forever, stored per device.
- The permanent disclaimer at the bottom of the page stays regardless and is not replaced by this.
- Keep the modal short. Propose the copy before shipping.

**The result figure.** Above the graphic, the unit count large with "units" beside it in a muted, smaller size.

**The syringe graphic.**
- A horizontal syringe: needle, hub, barrel with gradation marks, plunger.
- The barrel fills from the needle end in amber, proportional to the **selected syringe size**. Ten units on a 0.5 mL barrel fills a fifth. The same ten units on a 1 mL barrel fills a tenth.
- The graphic redraws when the syringe size changes. This proportionality is the whole point of the graphic.
- The fill animates upward into position when the result changes rather than snapping. Respect `prefers-reduced-motion`.
- **Gradation labels must be dense enough that a value anywhere between roughly 10 and 40 units is readable off the barrel.** Sparse labels defeat the purpose. Propose your labelling interval per syringe size.

**Misuse warning.**
- Shown when the result is **under 2 units** or **over the selected syringe capacity**. Both usually mean a wrong figure went in.
- Sits near the graphic, uses the existing warning treatment, and tells the user to re-check what they entered. It does not block anything.
- Red is reserved for destructive confirmation per `02-compound-lifecycle.md`, so this stays amber.

**Three result cards.** A row of three, left to right: **Concentration**, **mL per dose**, **Insulin units**. Each shows a label, the figure in the mono treatment, and its unit beneath. Insulin units carries the amber accent, since it is the number the user acts on.

**Input sheet.** One card containing, in order:
- **Syringe size**, as pills: 0.3 mL, 0.5 mL, 1 mL. The graphic always matches the selection.
- Total powder in the vial
- BAC water added
- Dose amount
- A **Reset** button spanning the bottom of the sheet, styled per `ui-context.md`.

**Reset.** Clears every input and closes the calculations panel, with the panel animating shut.

**View calculations.** A collapsed row reading "View calculations" that expands to show the working. Animates open and closed. Collapsed by default.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Capture the current calculation outputs for a set of test inputs, so you can prove afterwards that nothing changed.
2. Restructure the page into the order above without changing any logic.
3. Build the syringe graphic with proportional fill against the selected size. Propose the gradation labelling interval per syringe size.
4. Add the fill animation with the reduced-motion fallback.
5. Add the misuse warning on the two trigger conditions.
6. Build the three result cards.
7. Build the input sheet with syringe pills, three inputs and the Reset button.
8. Implement Reset clearing inputs and animating the calculations panel shut.
9. Build the collapsible calculations panel, collapsed by default.
10. Build the first-run modal with per-device dismissal. Propose its copy.
11. Re-run the test inputs from step 1 and confirm identical results.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Test inputs captured before any change
- [ ] Identical calculation results verified after the rebuild
- [ ] Page order is title, result, graphic, three cards, input sheet, view calculations, disclaimer
- [ ] Result figure sits above the graphic with the unit label muted beside it
- [ ] Syringe graphic renders needle, hub, gradated barrel and plunger
- [ ] Barrel fills proportionally to the selected syringe size
- [ ] Graphic redraws on syringe size change
- [ ] Gradation labelling interval proposed and approved per syringe size
- [ ] A value between 10 and 40 units is readable off the barrel
- [ ] Fill animates rather than snapping
- [ ] `prefers-reduced-motion` skips the animation
- [ ] Misuse warning fires under 2 units
- [ ] Misuse warning fires over syringe capacity
- [ ] Warning is amber, non-blocking, and does not use red
- [ ] Three result cards show concentration, mL per dose and insulin units
- [ ] Insulin units carries the amber accent
- [ ] Input sheet contains syringe pills, powder, BAC water, dose and Reset
- [ ] Syringe sizes are 0.3, 0.5 and 1 mL
- [ ] Reset clears inputs and animates the calculations panel shut
- [ ] View calculations collapsed by default and animates both ways
- [ ] First-run modal shown once, dismissed forever, stored per device
- [ ] First-run copy proposed and approved
- [ ] Permanent bottom disclaimer unchanged
- [ ] No presets, saved calculations or history added
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)