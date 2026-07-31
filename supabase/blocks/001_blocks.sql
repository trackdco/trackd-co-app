-- ============================================================================
-- blocks/001 — training blocks
-- ============================================================================
-- A block is a NAMED STRETCH OF TRAINING with a start and an end: a prep, an
-- off-season, a cut. It is not a new kind of data. Every screen of it is a query
-- over dated things Trackd already stores — doses, photos, weight, bloods,
-- journal, markers, cycles — so this table holds only the window and its intent.
--
-- Nothing derived is stored (architecture.md invariant). "Week 7 of 16", days
-- remaining, what was running, the retrospective totals: all computed on read.
--
-- Ownership is structural, not just RLS-checked, following 008/009: every FK is
-- composite so a row cannot reference another user's block even if a policy is
-- later loosened.
-- ============================================================================

create table if not exists public.blocks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  started_on    date not null,
  -- NULL = open ended. An off-season has no deadline and should not be made to
  -- invent one (Adrian, 2026-07-30).
  ends_on       date,
  status        text not null default 'active'
                check (status in ('active', 'completed', 'abandoned')),
  closed_on     date,
  reflection    text check (reflection is null or length(reflection) <= 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A block cannot end before it starts, and cannot be closed before it starts.
  constraint blocks_end_after_start check (ends_on is null or ends_on >= started_on),
  constraint blocks_closed_after_start check (closed_on is null or closed_on >= started_on),
  -- An active block is not closed; a finished one is.
  constraint blocks_closed_matches_status check (
    (status = 'active' and closed_on is null) or
    (status <> 'active' and closed_on is not null)
  ),
  -- The composite key 008/009 established, so child tables can reference this
  -- row AND its owner together.
  constraint blocks_id_user_key unique (id, user_id)
);

-- ONE LIVE BLOCK PER USER (Adrian, 2026-07-30). A partial unique index rather
-- than a trigger: it is the database's own job and it cannot be raced.
create unique index if not exists blocks_one_active_per_user
  on public.blocks (user_id)
  where status = 'active';

create index if not exists blocks_user_started_idx
  on public.blocks (user_id, started_on desc);

-- ---------------------------------------------------------------- targets ---
-- A LIST, not columns: any tracked variable may be a target, and one nullable
-- column per variable does not scale.
--
-- `variable` is CHECK-constrained to weight and consistency, and BLOODWORK IS
-- DELIBERATELY EXCLUDED (Adrian, 2026-07-30: "I'm not doing targets for blood
-- work. No way."). A target turns a reading into a pass or a fail, and biomarker
-- readings are exactly what the categorical-never-evaluative invariant protects.
-- Both permitted variables are facts about the user's own behaviour instead.
create table if not exists public.block_targets (
  id            uuid primary key default gen_random_uuid(),
  block_id      uuid not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  variable      text not null check (variable in ('weight', 'consistency')),
  -- kg for weight, percent for consistency.
  target_value  numeric not null check (target_value > 0),
  -- Stored, not inferred: 84 kg means the opposite thing to someone bulking than
  -- to someone cutting, and guessing from the starting value gets it wrong the
  -- moment they cross it.
  direction     text not null check (direction in ('up', 'down')),
  created_at    timestamptz not null default now(),

  -- Composite FK: the target's owner and the block's owner must be the SAME
  -- user, enforced by the key rather than by a policy.
  constraint block_targets_block_fk
    foreign key (block_id, user_id)
    references public.blocks (id, user_id)
    on delete cascade,
  -- One target per variable per block.
  constraint block_targets_one_per_variable unique (block_id, variable)
);

create index if not exists block_targets_block_idx
  on public.block_targets (block_id);

-- -------------------------------------------------------------------- RLS ---
alter table public.blocks enable row level security;
alter table public.block_targets enable row level security;

-- `(SELECT auth.uid())`, never bare: the bare call is re-evaluated once PER ROW,
-- which is the `auth_rls_initplan` finding Spec 17's advisor pass cleared out of
-- every other table. Same rule as `supabase/protocol/007_stacks.sql`.
drop policy if exists "blocks_owner_all" on public.blocks;
create policy "blocks_owner_all" on public.blocks
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "block_targets_owner_all" on public.block_targets;
create policy "block_targets_owner_all" on public.block_targets
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- RLS gates which ROWS you reach; a table-level GRANT is what lets the API role
-- reach the table AT ALL. This project's defaults do not auto-grant, so every
-- new public table must ship its own (architecture.md → Auth and Access Model).
-- Omitting these shipped Blocks dead: every read and write returned 42501 with
-- RLS and the policies above all perfectly correct.
grant select, insert, update, delete on public.blocks        to authenticated;
grant select, insert, update, delete on public.block_targets to authenticated;

-- `updated_at` maintenance, matching the other tables.
create or replace function public.touch_blocks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blocks_touch_updated_at on public.blocks;
create trigger blocks_touch_updated_at
  before update on public.blocks
  for each row execute function public.touch_blocks_updated_at();
