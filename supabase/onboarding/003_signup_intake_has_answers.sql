-- ============================================================
--  signup_intake — a claimed row must actually CARRY the answers.
--  Spec w2b-14, cold-review repair. Migration name: `signup_intake_has_answers`
--
--  APPLIED by Adrian, 2026-08-08, and VERIFIED live the same day: a thin row
--  (`running: [], struggle: []`) is now rejected by the database with
--  `23514 violates check constraint "signup_intake_has_answers"`, and a real
--  one still inserts. Verify against the live schema, never against this
--  comment — a hand-applied migration never appears in `list_migrations`.
-- ============================================================
--
--  THE DEFECT (found by a cold review of 002, reproduced live)
--    002 CHECK-constrains every VALUE — the tag lists, the length caps, the
--    detail scope — and constrains nothing about the row being worth writing.
--    `INSERT {user_id}` alone was accepted, producing
--    `{name: null, running: [], struggle: [], …}`.
--
--    That row is not merely useless, it is DESTRUCTIVE, because the table is
--    append-only and first-write-wins:
--
--      1. Someone completes onboarding on their PHONE and signs up by email.
--      2. They open the confirmation link on their LAPTOP, where their email is.
--         That laptop's onboarding session is empty, or holds only what they
--         typed the day they started the flow there and gave up.
--      3. The laptop claims and squats the row.
--      4. The phone's real answers hit 23505, are read as "already claimed",
--         and the device copy — the ONLY copy — is cleared.
--
--    There is no user-side repair: UPDATE and DELETE are both ungranted by
--    design, so only the service role can undo it.
--
--  WHY IT BELONGS HERE AND NOT ONLY IN TYPESCRIPT
--    `carriesAnswers` in `app/onboarding/actions.ts` implements the same rule
--    and is the thing that will normally stop this. But 002's own header claims
--    values are "constrained at the database rather than in TypeScript alone,
--    per Invariant 5", and the one constraint whose violation destroys data was
--    the one left out. A guard in an application is a convention; this is not.
--
--  THE RULE: both intent screens answered.
--    Not "anything is set". The first version of the TypeScript guard was an OR
--    across name/running/struggle and the review defeated it immediately — a
--    row of `{name, [], []}` squats just as well.
--
--    Both tag sets is exactly what `clampIntent` (`lib/onboarding/steps.ts`)
--    already requires before a device may reach the account screen, so every
--    legitimate claimer satisfies it by construction and a half-finished device
--    is refused at the earliest honest point. The name is NOT part of the test:
--    housekeeping already requires one, so a device with both tag sets has one,
--    and adding it as a third condition would only create a way for a real
--    answer set to be rejected.
--
--  IT WAS SAFE TO APPLY — and the first draft of this header was WRONG, which is why
--  the guard below exists.
--    That draft claimed "every existing row carries both tag sets". A query said
--    otherwise: of the 8 rows then present, ONE violated it — the
--    `{name: "Laptop", running: [], struggle: []}` row a cold review created to
--    demonstrate the very defect this fixes.
--
--    All of them belonged to `w2b14-*@trackd-qa.invalid` test accounts, which
--    have since been deleted (the FK cascaded the rows). **VERIFIED 2026-08-08:
--    `signup_intake` holds 0 rows.** No production user ever had one — the table
--    is a day old and nothing real has claimed yet — so there is no backfill
--    question and no data to preserve.
--
--    The guard below is there because that first draft existed. `NOT VALID` is
--    deliberately NOT used — a constraint that does not check what is already
--    stored is not the constraint anyone thinks they applied — so a violating
--    row would otherwise fail with a bare 23514 naming neither the row nor the
--    reason. This says both, and it runs; it is not a commented-out
--    verification block that reports "Success. No rows returned" without having
--    executed a single check (`supabase/protocol/024`, and the note about it in
--    `next-tasks.md`).
-- ============================================================

do $$
declare
  offending int;
begin
  select count(*) into offending
  from public.signup_intake
  where cardinality(running) = 0 or cardinality(struggle) = 0;

  if offending > 0 then
    raise exception
      'signup_intake_has_answers: % row(s) carry no intent answers. These are squatted rows — the exact defect this constraint exists to prevent. Inspect them, confirm they are not a real user''s only copy, and delete them before re-running: SELECT user_id, name, running, struggle FROM public.signup_intake WHERE cardinality(running) = 0 OR cardinality(struggle) = 0;',
      offending;
  end if;
end $$;

alter table public.signup_intake
  drop constraint if exists signup_intake_has_answers;

alter table public.signup_intake
  add constraint signup_intake_has_answers
  check (cardinality(running) > 0 and cardinality(struggle) > 0);
