# AI Workflow Rules

## Approach

Build Trackd Co incrementally using a spec-driven workflow. The `Context/`
files define **what** to build (`project-overview.md`), **how** to build it
(`architecture.md`, `code-standards.md`, `ui-context.md`), and the **current
state** (`progress-tracker.md`). Always implement against these specs — do not
infer or invent product behaviour from scratch. When the spec and your instinct
disagree, the spec wins; if the spec is wrong, fix the spec first (see below).

The sprint is structured in weekly exits (see `project-overview.md` Success
Criteria). Build toward the current week's exit, in the order the core loop
demands: auth → cycles → compounds/inventory → dose logging → daily-use loop.

## Scoping Rules

- Work on one feature unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.
- A unit is "done" only when it works end to end within its defined scope.

## When to Split Work

Split an implementation step if it combines:

- UI changes and schema/migration changes
- Multiple unrelated routes or screens
- Behaviour not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad —
split it.

## Handling Missing Requirements

- Do not invent product behaviour not defined in the context files. Trackd is an
  information tool, not a medical adviser — never add dosing, diagnosis,
  titration, or evaluative judgement that isn't specced.
- If a requirement is ambiguous, resolve it in the relevant context file
  **before** implementing.
- If a requirement is missing, add it as an open question in
  `progress-tracker.md` before continuing. Do not guess in code.

## Protected Files

Do not modify these unless explicitly instructed:

- `supabase/trackd_schema_v0_4_2.sql` and `supabase/trackd_storage_policies.sql`
  — the canonical data model. Schema changes are a deliberate, versioned
  decision, not a side effect of building a screen.
- `node_modules/**` and any third-party library internals.
- `components/ui/**` if a generated component library is later added.

## Keeping Docs in Sync

Update the relevant context file in the **same change** whenever implementation
alters:

- System architecture or boundaries → `architecture.md`
- Storage model or an invariant → `architecture.md`
- Code conventions or standards → `code-standards.md`
- Visual language or tokens → `ui-context.md`
- Feature scope or status → `project-overview.md` / `progress-tracker.md`

A change that touches behaviour but leaves the docs stale is not finished.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated — in particular: no
   stored derived values, RLS intact, health data presented categorically.
3. `progress-tracker.md` reflects the completed work and any new open questions.
4. `npm run build` passes.
