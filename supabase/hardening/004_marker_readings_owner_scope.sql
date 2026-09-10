-- ============================================================
--  Hardening 004 - owner-scope marker_readings uniqueness (Audit, 2026-09-08).
--
--  Closes the FIFTH instance of the cross-tenant unique-squat defect this
--  project already fixed four times (protocol/008, 009, 018, 024). marker_readings
--  was missed. PROVEN exploitable on production 2026-09-08: an attacker who knows
--  a victim's entry_id and user_marker_id can insert a row they own that occupies
--  the victim's UNIQUE (entry_id, user_marker_id) slot, permanently blocking the
--  victim's own upsert with a 42501 the victim cannot see or repair.
--
-- ============================================================
--  ⚠️⚠️ AS APPLIED, 2026-09-10. THIS FILE IS *HALF* RUN. READ THIS FIRST.
-- ============================================================
--
--  ⚠️ DO NOT PASTE THIS FILE AS IT STANDS. It would drop the unique the
--  DEPLOYED app still names as its `onConflict` target, and every journal-marker
--  save would fail with 42P10. The code change in step 1 below has NOT been made.
--
--  What was actually run was a SPLIT of this file, in the order that has no
--  breakage window. Adrian ran PART 1 only:
--
--    ✅ RUN  journal_entries_id_user_key, user_markers_id_user_key
--    ✅ RUN  the two composite FKs (entry_id, user_id) / (user_marker_id, user_id)
--    ✅ RUN  UNIQUE (user_id, entry_id, user_marker_id), added under the name
--            `one_reading_per_marker_per_entry_owner` ALONGSIDE the old unique
--            rather than replacing it, so the deployed app kept working.
--
--    ❌ NOT RUN  the drop of `one_reading_per_marker_per_entry`
--                (still UNIQUE (entry_id, user_marker_id))
--    ❌ NOT DONE the `onConflict` change in app/(app)/progress/actions.ts:360
--
--  ⚠️ THE VULNERABILITY IS CLOSED ANYWAY, and that is why stopping here was safe.
--  The COMPOSITE FKs are the fix, not the unique: an attacker's row needs
--  (victim's entry_id, attacker's user_id) to exist as a pair in journal_entries,
--  and it cannot. Verified against production 2026-09-10. The unique re-scoping
--  is belt to the FK's braces, exactly as the note at line ~70 says.
--
--  ▶ TO FINISH (two steps, either order is safe because both uniques exist now):
--
--    1. Change app/(app)/progress/actions.ts:360 to
--       `onConflict: "user_id,entry_id,user_marker_id"` and deploy.
--    2. Then run:
--         begin;
--         alter table public.marker_readings
--           drop constraint if exists one_reading_per_marker_per_entry;
--         alter table public.marker_readings
--           rename constraint one_reading_per_marker_per_entry_owner
--             to one_reading_per_marker_per_entry;
--         commit;
--
--  Only after BOTH does the VERIFY block at the foot of this file pass. Today it
--  does not, and that is expected rather than a fault.
--
--  Pre-flight measured on production before part 1 (all clean, so it applied):
--  0 rows pointing at another user's entry, 0 pointing at another user's marker,
--  0 duplicate (user_id, entry_id, user_marker_id) groups, 35 rows total.
-- ============================================================

-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS  (the ORIGINAL plan, superseded by the block above)
-- ------------------------------------------------------------
--
--   ⚠️ THE APP CODE AND THIS MIGRATION MUST SHIP TOGETHER. This migration drops
--   the old UNIQUE (entry_id, user_marker_id) that the app's upsert names as its
--   onConflict target and replaces it with UNIQUE (user_id, entry_id,
--   user_marker_id). Until both are in place the app breaks, so:
--
--   1. In the SAME change, edit app/(app)/progress/actions.ts, the marker_readings
--      upsert (~line 360):
--          - .upsert(rows, { onConflict: "entry_id,user_marker_id" });
--          + .upsert(rows, { onConflict: "user_id,entry_id,user_marker_id" });
--      (rows already include user_id, so no other code changes.)
--
--   2. Paste this whole file into the Supabase SQL Editor and run it. It is one
--      transaction: it either fully applies or changes nothing.
--
--   3. Deploy the code change at the same time (or immediately after) step 2.
--
--   4. Run the VERIFY block at the bottom.
--
--   5. Re-run the audit's proof to confirm the hole is closed:
--          node .security-audit-work/attack.mjs
--      EXPECT: the ATTACK insert now returns an error (foreign key / RLS), and the
--      victim's own upsert SUCCEEDS.
-- ============================================================

begin;

-- Helper uniques so a composite FK has something to reference. IF NOT EXISTS via
-- the catalog, so a re-run is a no-op.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_id_user_key') then
    alter table public.journal_entries
      add constraint journal_entries_id_user_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_markers_id_user_key') then
    alter table public.user_markers
      add constraint user_markers_id_user_key unique (id, user_id);
  end if;
end $$;

-- Replace the two single-column FKs with composite FKs that pin the referenced
-- row to the SAME owner. A row can no longer point entry_id / user_marker_id at
-- another user's rows, because (entry_id, user_id) must exist as a pair.
alter table public.marker_readings
  drop constraint if exists marker_readings_entry_id_fkey,
  drop constraint if exists marker_readings_user_marker_id_fkey;

alter table public.marker_readings
  add constraint marker_readings_entry_id_fkey
    foreign key (entry_id, user_id)
    references public.journal_entries (id, user_id) on delete cascade,
  add constraint marker_readings_user_marker_id_fkey
    foreign key (user_marker_id, user_id)
    references public.user_markers (id, user_id) on delete cascade;

-- Re-scope the uniqueness to the owner. Two users can now hold the "same"
-- (entry_id, user_marker_id) pair only if they are the same user - which the
-- composite FKs above already guarantee they are - so this is really belt to the
-- FK's braces, and it is what the app's onConflict now targets.
alter table public.marker_readings
  drop constraint if exists one_reading_per_marker_per_entry;

alter table public.marker_readings
  add constraint one_reading_per_marker_per_entry
    unique (user_id, entry_id, user_marker_id);

commit;

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards. Expect the composite FKs and the owner-scoped unique.
-- ------------------------------------------------------------
--
-- SELECT conname, pg_get_constraintdef(oid) AS def
--   FROM pg_constraint
--  WHERE conrelid = 'public.marker_readings'::regclass
--    AND contype IN ('u','f')
--  ORDER BY contype, conname;
--
--   EXPECT:
--     marker_readings_entry_id_fkey        FOREIGN KEY (entry_id, user_id)
--                                            REFERENCES journal_entries(id, user_id) ...
--     marker_readings_user_marker_id_fkey  FOREIGN KEY (user_marker_id, user_id)
--                                            REFERENCES user_markers(id, user_id) ...
--     one_reading_per_marker_per_entry     UNIQUE (user_id, entry_id, user_marker_id)
--
--   AND the old UNIQUE (entry_id, user_marker_id) must be GONE:
--
-- SELECT count(*) AS should_be_zero
--   FROM pg_constraint
--  WHERE conrelid = 'public.marker_readings'::regclass
--    AND pg_get_constraintdef(oid) = 'UNIQUE (entry_id, user_marker_id)';
