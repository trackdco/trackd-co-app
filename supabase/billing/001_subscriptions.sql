-- ============================================================
--  TRACKD CO — BILLING: subscriptions  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  Stripe subscription bookkeeping. ONE row per user (PK = user_id). The Stripe
--  webhook is the ONLY writer (service role); a user may READ their own row but
--  never write it — so billing state can't be forged from the client.
--
--  Feature entitlement still lives solely on profiles.tier (architecture.md →
--  "entitlements read profiles.tier and nothing else"). This table is the billing
--  record + the customer<->user mapping the webhook needs; the webhook writes
--  profiles.tier from the subscription status ('paid' while trialing/active/
--  past_due, else 'free'). profiles.tier is unchanged by this migration.
--
--  Implements the deferred "subscriptions / billing" model noted in
--  trackd_schema_v0_4_2.sql. We keep canceled rows (status flips to 'canceled'),
--  never hard-delete (Invariant 8: archive, never hard-delete).
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id                 uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    stripe_customer_id      text        NOT NULL UNIQUE,
    stripe_subscription_id  text        UNIQUE,
    stripe_price_id         text,
    -- Stripe subscription status: trialing | active | past_due | canceled |
    -- unpaid | incomplete | incomplete_expired | paused.
    status                  text        NOT NULL,
    cadence                 text,            -- 'monthly' | 'annual'
    current_period_end      timestamptz,     -- when the paid/trial period ends
    cancel_at_period_end    boolean     NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- The webhook resolves user from subscription metadata first, but falls back to
-- this customer->user lookup for events that arrive without it.
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx
    ON subscriptions (stripe_customer_id);

-- Reuse the shared trigger fn defined in trackd_schema_v0_4_2.sql.
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Users may READ their own subscription (to show plan/status). There is
-- deliberately NO insert/update/delete policy: the authenticated role cannot
-- write this table at all, so only the service-role webhook mutates billing
-- state. House pattern: (SELECT auth.uid()) for query-planner caching.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own subscriptions - select" ON subscriptions;
CREATE POLICY "own subscriptions - select"
    ON subscriptions FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────
-- RLS gates rows; PostgREST grants open the table (architecture.md). The user
-- read needs SELECT for `authenticated`. service_role already holds ALL via
-- ALTER DEFAULT PRIVILEGES (supabase/grants/002_service_role_grants.sql); we
-- grant explicitly so this migration is self-contained and can't 42501.
GRANT SELECT ON subscriptions TO authenticated;
GRANT ALL ON subscriptions TO service_role;
