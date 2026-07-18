# Feature Spec — Custom Markers + Custom Scales

> Prefix with the next free `NN-` from the live spec index.
> Match `01-design-system` house format.
> **Scope note:** this was in the locked "Deferred by design / v1.5" bucket. Confirm it's a go *now* before building (see the covering message). It is the heaviest of the current batch.

## Preflight (Supabase MCP against the live schema — before any code)

- Confirm `markers` table: columns for polarity, tier labels, category, and **how the 36 seed markers currently represent their scale** (inline enum? ordinal ints? a related table?). This determines whether a scale primitive already exists or must be introduced.
- Confirm markers RLS (currently read-only catalogue, service-role writes only) + grants.
- Confirm the readings table (`marker_readings`?): how a reading references marker + value, its RLS, and **cycle-ID stamping status** (this feature depends on that being sound).
- Confirm any enum types (polarity / category) a custom row must satisfy, and whether they're extensible.
- Confirm the security-invoker + explicit-grants + `SET search_path=''` conventions so custom-owned objects follow them.

## Goal

Let users create their own markers and define custom **ordinal scales** (e.g. low→high, weak→strong) for subjective tracking — without breaking the read-only system catalogue or the categorical-not-evaluative principle.

## Out of Scope

- Custom **compounds** (separate v1.5 item — do not conflate).
- Any AI / derived interpretation of custom markers.
- Sharing custom markers or scales between users.

## Design Decisions

- **Ownership model — DESIGN FORK (recommend option A):**
  - **A (recommend):** add nullable `user_id` (or `created_by`) + `is_system boolean` to `markers`. `is_system = true` / null owner = catalogue; owned rows = custom. RLS: `SELECT (is_system OR user_id = (SELECT auth.uid()))`; write only own rows; catalogue writes stay service-role-only. One read path, one table.
  - **B:** a separate `custom_markers` table unioned in a read view. Cleaner isolation, but two code paths and a union view to maintain. Recommend A for simplicity; flag if you'd rather ring-fence user data physically.
- **Scale primitive (new):** `marker_scales` (`id`, `user_id` nullable, `name`, `polarity`) + `marker_scale_levels` (`scale_id`, `ordinal int`, `label`). Ordered, labelled levels. A marker references a `scale_id`. System scales are owner-null; custom scales are user-owned. Where the seed markers currently encode scale inline, migrate them onto system-owned scale rows so **one representation serves both** system and custom markers.
- **Categorical-not-evaluative guardrail (hard):** custom scales are ordered + labelled + polarity-tagged (positive / negative / neutral) — **never** a numeric "risk" score. Polarity drives colour *category* only, never a good/bad verdict. This must hold for custom markers exactly as it does for system ones.
- **Soft-delete:** reuse the `removed_at` pattern from the compound soft-delete spec — never destroy a custom marker's readings history.
- **Uniqueness:** custom marker/scale names unique *per user*, not globally.

## Implementation Steps

1. Migration: `marker_scales` + `marker_scale_levels` (owner-scoped RLS + explicit grants + security-invoker on any read view). If seed markers encode scale inline, migrate them onto system-owned scale rows in the same migration.
2. Migration: ownership columns on `markers` (option A) + RLS split + grants. `SET search_path=''` on any SECURITY DEFINER helper; `COALESCE(array_length(...),0)` on any array checks.
3. Readings path: confirm `marker_readings` works identically for custom markers (FK, RLS, cycle-ID stamp). Note dependency on the cycle-ID-stamping work.
4. UI — "Create marker" in the markers section: name → pick or create a scale → set polarity. Informed-adult, dense style; no hand-holding.
5. UI — "Create scale": ordered labels + polarity, reusable across markers.
6. Custom markers render alongside system markers in tracking/journal, visually undifferentiated except an optional small "custom" tag.

## Acceptance Criteria

- User can create a marker on a custom scale, log readings across a cycle, and see it in journal/tracking exactly like a system marker.
- System catalogue stays unwritable by users — proven with a direct write attempt that fails.
- Two-account isolation: account B never sees account A's custom markers, scales or readings.
- Positioning/colour stays categorical (polarity-driven), never a risk verdict — for custom markers too.
- Removing a custom marker preserves its historical readings.

Spec 2:

# Feature Spec — Compound Soft-Delete (forward-only removal)

> Prefix with the next free `NN-` from the live spec index — I can't see it from here.
> Match `01-design-system` house format; do not introduce a competing structure.

## Preflight (Supabase MCP against the live schema — before any code)

- Confirm `protocol_compounds` structure + PK, and exactly how a compound attaches to a cycle/protocol.
- Confirm the existing cycle-archive pattern (`cycles.is_active`) and whether any soft-delete column (`removed_at` / `deleted_at` / `archived_at`) already exists anywhere — reuse naming, don't invent a second convention.
- Confirm `dose_logs` → `protocol_compounds` FK, and **whether any FK is `ON DELETE CASCADE`** (that cascade is the destructive path we are replacing on the normal delete route).
- Confirm the definitions of the forward-facing views/reads: today-dashboard (protocol clock), calendar month, active-protocol list, and the "log a dose" compound picker — establish where compounds are currently sourced and how they'd filter a removed one.
- Confirm `v_inventory_math` inputs so removed compounds stop being "loggable" without corrupting historical draw maths.
- Confirm RLS house pattern still covers a new column (a column add needs no new GRANT, but verify).

## Goal

Replace the current destructive "delete compound" with a **soft, forward-only** removal that mirrors the cycle-archive philosophy: past dose logs, inventory and all historical/calendar reads stay intact; the compound simply stops being offered for new doses from the removal point onward.

## Out of Scope

- Any user-facing hard/permanent delete — see **Decision needed**. Hard delete stays account-deletion-only via the existing cascade.
- Restore UI beyond the trivial (optional; noted).
- Any change to cycle archive behaviour.

## Design Decisions

- Soft-remove via **`protocol_compounds.removed_at timestamptz NULL`** (NULL = active). **Rows are never dropped** on the delete route.
- **Forward-only semantics:** dose logs dated before `removed_at` stay valid and visible in every historical/calendar surface; the compound is excluded from today-dashboard, active-protocol, and the "log a dose" picker whenever `removed_at IS NOT NULL`.
- `removed_at` is a **fact, not a derived value** — consistent with the no-derived-values invariant.
- Forward views filter `removed_at IS NULL`; historical reads keep the compound (optionally date-bounded to `≤ removed_at`).
- **Restore** = set `removed_at = NULL` (trivial; expose or defer per Decision).
- **UI label:** "Delete", per your ask — behaviour is soft. Noting once: a soft action labelled "Delete" can mislead users into thinking data is gone; the confirm copy should state history is kept. Your call on the label.

### Decision needed — hard-delete escape hatch

**Recommendation: no user-facing hard delete in v1.** This matches your existing locked rule for cycles ("archived, never hard-deleted; never expose a hard Delete"). Extending the same rule to compounds is *consistent*, not new philosophy — hard delete remains account-deletion-only.

If you insist on an escape hatch: a guarded **"Remove permanently"** available *only on an already-removed compound*, behind a destructive typed confirm, cascading that compound's `dose_logs` + inventory. I'd still recommend deferring it — nobody has asked for it, and it's the one path that can destroy moat data.

## Implementation Steps

1. Migration (canonical schema file → tracked migration, never a dashboard patch): add `removed_at timestamptz` to `protocol_compounds`. Confirm RLS still covers.
2. Verify FKs: ensure the normal delete route no longer triggers `ON DELETE CASCADE` (we stop deleting rows). Cascade remains only on the account/cycle hard-delete path.
3. Update forward-surface views/reads (today-dashboard, calendar, active protocol, dose picker source) to filter `removed_at IS NULL`. Leave historical reads intact.
4. Update `v_inventory_math` consumers: removed compounds are not "loggable", but their historical draw maths are preserved untouched.
5. Wire the "Delete" action → `removed_at = now()`. Confirm copy is neutral and states history is retained.
6. (Optional / deferrable) Restore affordance on removed compounds.

## Acceptance Criteria

- Deleting a compound removes it from today / log-a-dose / active protocol immediately; every historical dose log for it stays visible and correct; inventory history intact.
- **No rows hard-deleted** by the Delete action (verify directly in the DB).
- Editing or undoing an old dose for a *removed* compound still reflows maths correctly.
- Two-account RLS: account B cannot read account A's removed compounds or their logs, through views or base tables.

# Feature Spec — Journal Photo Attachments

> Prefix with the next free `NN-` from the live spec index.
> Match `01-design-system` house format.

Spec 3:

## Preflight (Supabase MCP against the live schema — before any code)

- Confirm the journal entry table name + columns, and its **cycle-ID stamping status** (attachments inherit the entry's cycle link, so the entry must be cycle-stamped for cross-cycle comparison to hold).
- Confirm the existing private `bloodwork` bucket and its owner-scoped storage policies — mirror them exactly.
- Confirm the storage policy/grant pattern and how the app currently issues **signed URLs**.
- Confirm whether journal entries are soft-deleted (so attachments follow the same lifecycle).

## Goal

Let users optionally attach photo(s) to a journal entry. The **entry point is quiet** (not a prominent camera CTA); **retrieval is easy** — entries with a photo show a small thumbnail that taps through to a full-screen view.

## Out of Scope

- Photo editing / cropping / AI vision.
- The bloodwork photo pipeline (separate).

## Design Decisions

- **New private storage bucket `journal`** (or a `journal/` prefix), owner-scoped policies mirroring `bloodwork`. **Never public.** Photos are as radioactive as bloodwork — same isolation rigor.
- **`journal_attachments` table** (`id`, `journal_entry_id` FK, `storage_path`, `user_id` owner, `created_at`). Supports 0..n photos — even if the UI ships single-photo now, the table doesn't box us in. Owner-scoped RLS + explicit grants; no derived values; security-invoker on any read view.
- **Quiet entry:** a small attach affordance (paperclip / photo icon) inside the entry composer — not a big button. Camera/library on tap.
- **Easy retrieval:** entries with attachments show a small thumbnail; tap → full-screen viewer. Journal list/calendar can carry a subtle "has photo" indicator.
- **Signed URLs** for display; never expose raw bucket paths.
- **Privacy:** consider stripping EXIF GPS on upload (small; flagged, not blocking).

## Implementation Steps

1. Storage: create private `journal` bucket + owner-scoped policies (mirror `bloodwork`) + confirm grants.
2. Migration: `journal_attachments` (RLS + grants + security-invoker on any read view). Handle the entry-deletion / soft-delete path consistently for attachments.
3. Upload path: client → signed upload → insert attachment row, owner-stamped.
4. Composer UI: quiet attach affordance (icon, not a CTA block).
5. Display: thumbnail on the entry + full-screen viewer via signed URL; subtle indicator in lists/calendar.
6. (Optional) EXIF GPS strip on upload.

## Acceptance Criteria

- User can attach a photo to a journal entry; the affordance is unobtrusive in the composer but obvious to find afterward.
- Photo is only ever visible to its owner — two-account isolation proven, including via the signed URL / bucket path.
- Deleting or soft-deleting the entry handles its attachments consistently.
- No public URLs anywhere.

# Feature Spec — Per-Dose Entry Hint

> Prefix with the next free `NN-` from the live spec index.
> Match `01-design-system` house format. UI-only; no schema change.

## Preflight (against the live UI + design system — before any code)

- Confirm the add-compound and dose-log entry components, and exactly where the per-dose amount is entered (`protocol_compounds` dose unit/amount fields).
- Confirm the design tokens for a **neutral / informational** inline hint — explicitly NOT the error/red treatment (principle 3: categorical, not evaluative — no red warnings).

## Goal

A discreet, persistent inline hint at the dose-entry field, clarifying the value is **per single administration, not a weekly total** — so users don't enter a weekly dose in the per-dose field and end up logging far more than they administer.

## Out of Scope

- Any dosing guidance, safe-range logic, or validation that judges the amount (TGA + principle 3). This is **field-semantics only**.
- Blocking or validating the entered number.

## Design Decisions

- **Information, not warning.** You said "warning" + "super discreet"; realised as quiet neutral helper text — no red, no alarm icon, no moralising. This honours principle 3 (no red warnings) while still catching the mistake. Flagging so the styling doesn't surprise you.
- **TGA-safe copy:** about what the *field* means, never what's safe to take. Draft:
  > *Amount per dose (single administration) — not your weekly total. Example: dosing 250 mg twice weekly → enter 250 mg.*
- **Persistent, not a one-time toast.** The error is silent and costly, so keep the hint always visible (or on focus) at the field — not a dismissable one-off.
- No schema change.

## Implementation Steps

1. Add persistent neutral helper text under the per-dose amount field in add-compound and any dose-log entry surface.
2. Use the info/neutral token — never error/red.
3. Copy per the draft above; keep it strictly field-semantics (no dosing/safety advice).

## Acceptance Criteria

- Hint appears at every per-dose entry point, styled neutral (not red/error).
- Copy references field meaning only — no dosing or safety advice (TGA-clean).
- No validation or blocking is introduced.