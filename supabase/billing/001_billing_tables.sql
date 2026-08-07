-- ============================================================
--  Billing — four tables. Spec w2b-15, step 3.
--  Migration name: `billing_tables`
--
--  APPLIED by Adrian, 2026-08-08, and VERIFIED live the same day by querying the
--  schema and by attempting duplicate inserts:
--    - the stale `cadence` column is gone, so the drop-and-recreate ran
--    - a second `webhook_events` row with the same event id -> 23505
--    - a second `entitlements` row for the same (user, product, source) -> 23505
--    - a `comp` entitlement BESIDE a `stripe` one -> accepted, as intended
--    - a second `billing_customers` row for one user -> 23505
--  Verify against the live schema, never against this comment — a hand-applied
--  migration never appears in `list_migrations`, which is exactly why
--  `supabase/onboarding/001`'s header sat stale for six days.
-- ============================================================
--
--  THE RULE THAT OUTRANKS EVERYTHING ELSE IN THIS SPEC
--    **The app never asks Stripe whether a user has access. It asks
--    `entitlements`.** Stripe writes that table through the webhook; Apple and
--    Google will write the same table through RevenueCat when TRACKD reaches the
--    App Store, and no application code changes. If any access check anywhere
--    reads a Stripe subscription status, or a `stripe_` column, the spec has
--    failed regardless of whether payments work.
--
--    That is why `subscriptions` and `entitlements` are two tables and not one.
--    They look redundant and are not: one MIRRORS a provider, the other DECIDES
--    access, and collapsing them would make the provider authoritative again.
--
--  WHAT EACH ONE IS FOR
--    billing_customers  the TRACKD user <-> Stripe customer link. One row per
--                       user, created once, never deleted.
--    subscriptions      a local mirror of Stripe, never the authority. Exists so
--                       the app can say "renews on the 14th" without a network
--                       call. NOTHING gates on it.
--    entitlements       the ONLY table the app reads to decide access.
--    webhook_events     every event Stripe sends, inserted FIRST. The unique
--                       constraint on `stripe_event_id` is the idempotency
--                       mechanism — see that table.
--
--  A STALE `subscriptions` TABLE IS DROPPED FIRST
--    The abandoned `stripe` branch applied a differently-shaped table of the
--    same name to this database. See the guarded block below; `CREATE TABLE IF
--    NOT EXISTS` would have skipped silently and left it in place.
--
--  ON `profiles.tier`
--    It is NOT touched here and must not become a second source of truth.
--    `grants/003` locks it to the service role and `project-overview.md` still
--    describes it as the entitlement column; that is now historical. Gates read
--    `entitlements`. Reconciling the two is a follow-up, deliberately not done in
--    the same migration as the tables.
-- ============================================================

-- ------------------------------------------------------------
--  FIRST: remove the stale `subscriptions` table from the abandoned attempt.
--
--  A previous branch (`stripe`, never merged) shipped
--  `supabase/billing/001_subscriptions.sql` and it WAS applied to this database.
--  Its `subscriptions` is a different table wearing the same name:
--
--    old                                    new
--    ---------------------------------      ------------------------------------
--    user_id PRIMARY KEY (one per user)     id uuid PK, user_id indexed
--    stripe_customer_id NOT NULL UNIQUE     -> its own `billing_customers` table
--    status text                            status subscription_status (enum)
--    cadence text                           (gone — the price id says which plan)
--    (no trial end at all)                  trial_ends_at timestamptz
--
--  This matters more than it looks. `CREATE TABLE IF NOT EXISTS` would have
--  silently done NOTHING, left the old shape in place, and reported success —
--  and the failure would have surfaced later as the webhook failing to insert a
--  column that does not exist, on a live payment. Found by querying the schema
--  rather than by trusting the file tree, which is the rule this project keeps
--  relearning.
--
--  SAFE: verified 2026-08-08 the live table holds **0 rows**, and a codebase
--  search finds no reader — `lib/stripe/` does not exist on `main` and nothing
--  queries the table. There is no billing data to lose because no payment has
--  ever been taken.
--
--  Guarded anyway. If a row appears between this being written and being run,
--  the migration STOPS rather than dropping someone's billing record.
-- ------------------------------------------------------------

do $$
declare
  stale int;
begin
  if to_regclass('public.subscriptions') is null then
    return;
  end if;

  -- The old table is identifiable by a column the new one does not have.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions'
      and column_name = 'cadence'
  ) then
    return;  -- already the new shape; nothing to do.
  end if;

  execute 'select count(*) from public.subscriptions' into stale;
  if stale > 0 then
    raise exception
      'billing_tables: the stale `subscriptions` table from the abandoned stripe branch holds % row(s). It was expected to be empty. Inspect it before continuing — this migration will DROP it: SELECT * FROM public.subscriptions;',
      stale;
  end if;

  drop table public.subscriptions cascade;
end $$;

-- ------------------------------------------------------------
--  Enums. Constrained at the database rather than in TypeScript alone
--  (Invariant 5), and named for what they describe rather than for Stripe, so
--  Apple and Google fit the same columns.
-- ------------------------------------------------------------

-- Mirrors Stripe's subscription statuses 1:1. `paused` is included because
-- Stripe can produce it; nothing in the app creates one.
do $$ begin
  create type subscription_status as enum (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete',
    'incomplete_expired', 'unpaid', 'paused'
  );
exception when duplicate_object then null; end $$;

-- WHERE an entitlement came from. `comp` is how founder, cofounder and
-- beta-tester accounts get access with no Stripe subscription at all — which is
-- also the cheapest possible proof that the read path never asks Stripe.
do $$ begin
  create type entitlement_source as enum ('stripe', 'apple', 'google', 'comp');
exception when duplicate_object then null; end $$;

-- WHAT was granted. One product today; an enum rather than free text so a typo
-- cannot silently grant access to a product that does not exist.
do $$ begin
  create type entitlement_product as enum ('pro');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
--  billing_customers
-- ------------------------------------------------------------

create table if not exists public.billing_customers (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  -- UNIQUE on both sides: `user_id` by the primary key, and this. Two TRACKD
  -- users sharing one Stripe customer would make the webhook's user lookup
  -- ambiguous, and an ambiguous lookup in a billing webhook grants the wrong
  -- person access.
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.billing_customers enable row level security;

-- READ-ONLY to the user. Every write is the webhook or the subscription
-- endpoint, both service-role. There is no legitimate reason for a browser to
-- create or alter a Stripe customer link, so no policy grants it.
drop policy if exists "own billing_customers - select" on public.billing_customers;
create policy "own billing_customers - select"
  on public.billing_customers for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.billing_customers to authenticated;

drop trigger if exists set_billing_customers_updated_at on public.billing_customers;
create trigger set_billing_customers_updated_at
  before update on public.billing_customers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  subscriptions — a MIRROR. Nothing gates on this table.
-- ------------------------------------------------------------

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text not null unique,
  -- WHICH price, so the Billing row can say "Yearly" without asking Stripe.
  -- Deliberately NOT an enum: price IDs differ between test and live mode and
  -- change whenever a price is re-created, and a CHECK that has to be migrated
  -- every time Adrian edits the dashboard is a CHECK that will be wrong.
  stripe_price_id        text not null,
  status                 subscription_status not null,
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

-- Read-only to the user, for the same reason as `billing_customers`.
drop policy if exists "own subscriptions - select" on public.subscriptions;
create policy "own subscriptions - select"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.subscriptions to authenticated;

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  entitlements — THE ONLY TABLE THE APP READS TO DECIDE ACCESS
-- ------------------------------------------------------------

create table if not exists public.entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  product      entitlement_product not null,
  source       entitlement_source not null,

  -- WHEN access runs out. The trial end while trialing, the period end once
  -- paying. Nullable ONLY for a `comp`: a founder account has no end date, and
  -- inventing one would mean someone's access silently expiring on a date
  -- nobody chose. `is_active_now` below treats NULL as "does not expire".
  active_until timestamptz,

  -- The KILL SWITCH, separate from the date on purpose. A cancellation at period
  -- end leaves `active_until` in the future and `is_active` true — the user keeps
  -- the month they paid for. Revoking outright (a chargeback, a comp withdrawn)
  -- sets this false without touching the date, so the history stays readable.
  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- ONE ROW PER (user, product, source), so the webhook can upsert without
  -- reading first. Not `(user_id, product)`: a user may legitimately hold a
  -- `comp` AND a `stripe` entitlement at once — a founder who also subscribes,
  -- or a beta tester converting — and collapsing them would make one silently
  -- destroy the other. `is_active_now` takes whichever is still valid.
  constraint entitlements_one_per_source unique (user_id, product, source)
);

-- The read path's index: "does this user have active access to `pro` right now".
create index if not exists entitlements_lookup_idx
  on public.entitlements (user_id, product)
  where is_active;

alter table public.entitlements enable row level security;

-- READ-ONLY to the user, and this is the load-bearing one. The spec: "Do NOT
-- write entitlements, unlock features, or set any access flag from client-side
-- code under any circumstances. Anyone with browser dev tools can trigger a
-- client success state." There is no insert, update or delete policy and no
-- write grant, so that is enforced by the database rather than by a convention
-- somebody has to remember. The webhook writes as service_role, which bypasses
-- RLS and holds GRANT ALL from `supabase/grants/002`.
drop policy if exists "own entitlements - select" on public.entitlements;
create policy "own entitlements - select"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.entitlements to authenticated;

drop trigger if exists set_entitlements_updated_at on public.entitlements;
create trigger set_entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  webhook_events — the idempotency mechanism, not a log
-- ------------------------------------------------------------

create table if not exists public.webhook_events (
  -- THE WHOLE POINT OF THIS TABLE. Stripe retries on failure and delivers out
  -- of order, so the same event WILL arrive more than once — that is normal
  -- operation, not an error. Inserting first and letting this constraint reject
  -- the duplicate is what makes every handler below it safe to run twice,
  -- without a single handler having to be written idempotently by hand.
  stripe_event_id text primary key,
  type            text not null,
  -- The verbatim event. Kept because a handler that turns out to be wrong can
  -- then be re-run against what actually arrived, rather than against what we
  -- wish had arrived.
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  -- NULL until the handler finishes. A row with a null `processed_at` is an
  -- event that arrived and did not complete — which is the only signal there is
  -- that something is wrong, so it is a column rather than a log line.
  processed_at    timestamptz
);

create index if not exists webhook_events_unprocessed_idx
  on public.webhook_events (received_at)
  where processed_at is null;

alter table public.webhook_events enable row level security;

-- NO POLICIES AND NO GRANTS AT ALL, deliberately. This table is not the user's
-- data — it is Stripe's raw payloads, which carry customer ids, card metadata
-- and amounts for whoever the event concerns. `authenticated` has no business
-- reading any of it, and RLS with no policy denies everything. Only
-- `service_role` reaches it (GRANT ALL, `supabase/grants/002`).
--
-- RLS is enabled anyway rather than left off: a table without RLS in a schema
-- exposed by PostgREST is one accidental grant away from being world-readable,
-- and Supabase's own linter flags it.
