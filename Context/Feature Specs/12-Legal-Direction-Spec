# Spec: Legal Compliance Cutover (consent capture + calculator transparency)

**Status:** Ready to build · Implement one step at a time, verifying each before the next (per `code-standards.md` and `AI-workflow-rules.md`).

> **Reconciled to current build.** Age verification already exists (date of birth + server-side check) and stays as-is. The reconstitution calculator already shows an on-screen warning — this spec aligns it to the exact wording and confirms it is persistent, and **deliberately adds no confirmation gate** (this matches the product design: warning shown, user independently verifies). The change to make is replacing the single combined consent tickbox with three separate ones, logging consent versions, adding the calculator's shown working, and guarding the bloodwork display.

> **One decision to confirm with Angus/Adrian before Step 2.** This spec **intentionally requires a schema change** (a new `consent_records` table) — a deliberate, scoped exception to the usual "no schema changes" rule, because per-user, per-version consent logging is a legal requirement the Terms of Service and Privacy Policy now promise, and it needs an auditable store. Fallback if a migration isn't wanted right now: write consent records into Supabase Auth `app_metadata` (server-side only, not user-w
ritable). The table is preferred.

## Goal

Make the app's signup and reconstitution-calculator flows match the finalised legal documents (Terms of Service v1.3, Privacy Policy v1.3, Medical Disclaimer v1.3): capture three **separate** affirmative consents at signup and **record which version of each document the user accepted and when**; ensure the calculator's risk warning is shown persistently in the exact agreed wording (no confirmation gate); show the calculation step by step; and keep the bloodwork display strictly neutral.

## Out of Scope

- Do **NOT** add any new navigation tab or restructure navigation.
- Do **NOT** introduce mock/placeholder data or fallback values anywhere in these flows.
- Do **NOT** change the visual design system — reuse existing components and tokens from `ui-context.md`; do not invent new card, button, or checkbox styles.
- Do **NOT** add a confirmation gate, "I understand" modal, or any blocking acknowledgement to the calculator. The warning is shown; the user verifies independently. (See the optional note at the end.)
- Do **NOT** rebuild age verification — date-of-birth entry and the server-side 18+ check already exist and stay.
- Do **NOT** build payment, subscription-cancellation, or email-related UI here — payments and email are not live; those are separate, later specs.
- Do **NOT** alter the calculator's underlying maths — only display its working.
- Do **NOT** change the wording of the legal documents; link to them as-is.

## Design Decisions

- **Design system — `ui-context.md`:** all UI (the three checkboxes, the calculator warning, the shown working) must use the existing Obsidian system — cool near-blacks, Playfair Display headings, Instrument Sans UI text, JetBrains Mono for any numeric/data display, amber accent `#E2A33D` used sparingly, 3–4-element-per-screen restraint. Reuse the existing card and checkbox components.
- **Architecture — `architecture.md`, `project-overview.md`:** locate the existing signup/auth component, the reconstitution-calculator component, and the bloodwork/biomarker display component from these files. Do not hard-code new paths; follow existing structure and naming.
- **Document versions to record:** `tos` = `1.3`, `privacy` = `1.3`, `disclaimer` = `1.3`, plus `health_data_consent` = `1.3` (tied to the Privacy Policy). Store the version string with every consent record so future re-acceptance (on a material change) can compare versions. The existing 18+ result and timestamp from the date-of-birth check continue to be recorded as they are now.
- **Consent storage (`consent_records` table):** columns — `id` (uuid, pk), `user_id` (uuid, fk → auth.users, not null), `document` (text/enum: `tos` | `privacy` | `disclaimer` | `health_data_consent`), `version` (text, not null), `accepted_at` (timestamptz, default now()), `user_agent` (text, nullable). Append-only. RLS: a user may `insert` and `select` only rows where `user_id = auth.uid()`; no `update`/`delete` from the client. Index on `(user_id, document)`.

## Implementation

### Step 1 — Replace the single signup tickbox with three separate, un-ticked consents
- The signup flow currently has date-of-birth entry (keep) and a single combined "I have agreed to…" checkbox (replace).
- Replace that single checkbox with **three** separate, **un-ticked** controls, each linking to the relevant document (open in a new view/sheet):
  1. ☐ "I agree to the Terms of Service and Privacy Policy." → links to ToS v1.3 and Privacy Policy v1.3 (`tos`, `privacy`).
  2. ☐ "I have read and agree to the Medical Disclaimer." → links to Medical Disclaimer v1.3 (`disclaimer`).
  3. ☐ "I explicitly consent to Trackd processing my health-related data (compounds, doses, bloodwork, body metrics, photos and journal entries) to provide the Service." → links to Privacy Policy v1.3, Section 1 (`health_data_consent`).
- The "Create account" action stays **disabled** until all three are ticked (in addition to the existing date-of-birth/age requirement). None may be pre-ticked.
- **Verify before proceeding:** signup cannot complete unless all three are checked and the age check passes; the document links open the correct documents.

### Step 2 — Persist consent records
- Create the `consent_records` table and RLS policies described in Design Decisions (migration), **or** the confirmed `app_metadata` fallback.
- On successful signup, write one row per consented item (`tos`, `privacy`, `disclaimer`, `health_data_consent`), each with its `version` (`1.3`) and `accepted_at`.
- **Verify before proceeding:** after a test signup, four rows exist for that user with the correct `document`, `version`, and timestamp; a second user cannot read the first user's rows (RLS holds).

### Step 3 — Reconstitution calculator: align the persistent warning (no gate)
- Ensure the reconstitution-calculator screen shows a **persistent, non-dismissable warning** (always visible) using the existing card component, with **exactly** this copy:
  > "This is a calculator, not a dosing instruction. It does only arithmetic on the numbers you enter and may be wrong. Re-check every figure and confirm it against your physical product before drawing or injecting anything. Do not rely on this output alone."
- Do **not** add any blocking modal, checkbox, or "I understand" step. The user can use the calculator immediately; the warning simply stays on screen.
- **Verify before proceeding:** the warning card is always visible on the calculator and matches the copy above; there is no gate or blocking step.

### Step 4 — Calculator shows its working
- Change the calculator output so it **displays the calculation, not just the final number**. Show, in JetBrains Mono per `ui-context.md`:
  - the inputs used (powder mass, solvent volume, target dose);
  - the derived **concentration** (e.g. mass ÷ solvent volume → mg/mL); and
  - the **volume to draw** (e.g. target dose ÷ concentration → mL, and the equivalent in syringe units if shown).
- Lay it out so a user can read each step and check it by hand. Do not change the maths — only reveal it.
- **Verify before proceeding:** for a known example, the displayed steps and intermediate values are correct and match the final figure.

### Step 5 — Bloodwork display: confirm neutral, non-clinical presentation
- The bloodwork/biomarker indicator is already categorical (below/within/above). Confirm it stays a **neutral position indicator only**.
- Ensure nothing implies clinical judgement: no labels like "abnormal", "high (bad)", "low (bad)", "danger", and no alarm-style red semantics that suggest a value is unsafe. Neutral colour/position only.
- **Verify before proceeding:** the bloodwork view shows position relative to range without interpreting, flagging, or diagnosing any value.

## Check When Done

- [ ] Signup shows three separate, un-ticked consents; account creation is blocked until all are ticked (plus the existing age check); each links to the correct v1.3 document.
- [ ] `consent_records` exists (or confirmed `app_metadata` fallback) with append-only, per-user RLS; four rows written per signup with correct `document`/`version`/`accepted_at`.
- [ ] Calculator shows a persistent, non-dismissable warning with the exact copy above, and **no** confirmation gate or blocking step.
- [ ] Calculator displays its working (inputs → concentration → draw volume) with correct intermediate values; maths unchanged.
- [ ] Bloodwork view presents below/within/above neutrally, with no interpretive, flagging, or diagnostic language or alarm styling.
- [ ] No new navigation tabs added.
- [ ] No mock or placeholder data introduced.
- [ ] No new TypeScript or lint errors; no new components beyond what is strictly required (reuse existing card/checkbox components per `ui-context.md`).
- [ ] Each step above was verified before the next was started.

---

*Optional, not in scope above (Angus's call):* a **one-time** disclaimer acknowledgement on first calculator use — distinct from a per-calculation confirmation gate — would add a little extra liability protection without gating every calculation. It is intentionally left out here to match the current "warning only, no gate" design. If you later want it, ask and I'll add it as its own small step (it would also add a `calculator_ack` row to `consent_records`).