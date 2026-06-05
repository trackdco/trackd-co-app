-- ============================================================
--  TRACKD CO — CONSOLIDATED DATABASE SCHEMA (v0.4.2)  [CANONICAL]
-- ============================================================
--
--  Derived from the Milligram competitor teardown (flows 1-10) and
--  adapted to Trackd's bodybuilding-first, unified-stack positioning.
--
--  STACK: Supabase (Postgres 16 + Auth + Storage + Row Level Security).
--
--  COMPANION FILE: trackd_storage_policies.sql — private bloodwork
--  bucket + owner-scoped storage.objects policies. Apply it in the SAME
--  migration session as this file (it depends on the Supabase storage
--  schema and cannot run on vanilla Postgres).
--
--  -- WHAT CHANGED FROM v0.4.1 (2026-06-05) ------------------------
--  (Pre-deploy hardening pass — no v0.4.1 had ever been applied to a DB.
--  No data-model changes; three small integrity/robustness refinements.)
--  ADJ 1 - UNIQUE on the seed-catalogue name columns (compounds, biomarkers,
--    markers) — prevents accidental duplicate catalogue rows at seed time.
--  ADJ 2 - handle_new_user() profile insert is now ON CONFLICT (id) DO NOTHING
--    so a retry/race can't throw and break signup (a failing trigger here
--    blocks the whole auth.users insert). Mirrors handle_new_profile_prefs.
--  ADJ 3 - CYCLES documented as ARCHIVE-never-hard-delete. The delete cascade
--    to dose/injection history is kept ONLY so account deletion still fully
--    erases a user; the app must archive cycles via is_active, not DELETE.
--    Switching the cascade to RESTRICT would break account deletion.
--
--  -- WHAT CHANGED FROM v0.4 ---------------------------------------
--  FIX F - schedule_shape: specific_days now requires >= 1 day.
--    '{}' is non-null so it passed both prior CHECKs; the length test is
--    COALESCE'd because array_length('{}') is NULL and NULL passes a
--    CHECK. (HOUSE RULE candidate: array-length CHECKs always COALESCE.)
--  NOTE - companion file trackd_storage_policies.sql created: private
--    bloodwork bucket + owner-scoped storage.objects policies. Runs on
--    Supabase only (depends on the storage schema) — apply it in the
--    same migration session as this file.
--
--  -- WHAT CHANGED FROM v0.3 ---------------------------------------
--  (Security/integrity hardening pass — no data-model changes.)
--  SEC 1 - Both views now created WITH (security_invoker = true).
--    Postgres 15+ views default to executing as their OWNER, and the
--    owner (postgres on Supabase) bypasses RLS — so v_inventory_math and
--    v_biomarker_position returned EVERY user's rows to any authenticated
--    caller. HOUSE RULE: every view in this schema declares
--    security_invoker = true. RLS verification must query the VIEWS,
--    not just the tables (the views are what the app/PostgREST hit).
--  SEC 2 - SECURITY DEFINER functions pin SET search_path = ''
--    (handle_new_user, handle_new_profile_prefs). Closes the search_path
--    hijacking vector; all object references inside stay fully qualified.
--  FIX C - Unit-family integrity is now DB-enforced at both ends.
--    Previously a dose logged in iu against an mg-tracked item (or an
--    inventory item created against a cross-family planned dose) summed
--    raw magnitudes into remaining_base with no error. New helper
--    unit_family_compatible() + BEFORE triggers on inventory_items,
--    protocol_compounds (dose_unit updates) and dose_logs reject
--    cross-family writes. Families: mg/mcg <-> 'mg'; iu <-> 'iu'.
--  FIX D - reconstituted items must have base_unit = total_amount_unit
--    (the union CHECK previously let them vary independently).
--  FIX E - protocol_compounds schedule integrity tightened:
--    COALESCE(array_length(dose_times,1),0) = times_per_day (COALESCE
--    so an empty array can't NULL past the CHECK); days_of_week values
--    constrained to 1..7 (Mon=1); interval_days >= 1.
--  NOTE - marker_readings.tier_value upper bound (<= tier_labels length)
--    is cross-table and stays an APP-LAYER guard, not a schema rule.
--  NOTE - Supabase Storage policies are NOT in this file. The bloodwork
--    bucket (lab_panels.source_file_path) must be private with
--    owner-scoped storage.objects policies — table RLS does not protect
--    the uploaded PDFs. Verify in the two-account bug-bash test.
--
--  -- WHAT CHANGED FROM v0.2 ---------------------------------------
--  ADD 1 - profiles.tier (enum user_tier: 'free' | 'paid'). The single
--    entitlement column: every feature gate in the app checks THIS, never
--    Stripe state directly. Stripe webhooks (post-beta) become its only
--    writer. BETA DEFAULT IS 'paid' so every tester gets full
--    entitlements — FLIP THE DEFAULT TO 'free' BEFORE PUBLIC LAUNCH
--    (one-line migration).
--  ADD 2 - profiles.timezone (IANA name, set from the browser at
--    onboarding). dose_times are local times-of-day; scheduled Edge
--    Functions (dose-reminder push, low-inventory alerts) need a stored
--    tz to know when a user's 08:00 is. Client-side display keeps using
--    the device tz directly.
--  ADD 3 - push_subscriptions (Section 7). Web Push delivery targets,
--    one row per device/browser. notification_preferences says WHAT a
--    user wants; this says WHERE to send it. Was an undocumented gap.
--  NOTE - cycles: no DB-level cycle cap exists, deliberately — beta
--    testers run unlimited cycles. The single-active-cycle index remains
--    commented pending the paid-tier decision; whether the beta UI
--    supports multiple SIMULTANEOUS active cycles is an app-layer call.
--
--  -- WHAT CHANGED FROM v0.1 ---------------------------------------
--  FIX A - Inventory is no longer peptide-shaped. The old `vials` table
--    assumed reconstituted powder + BAC water, which is wrong for the
--    core ICP compound (oil-based test at a stated mg/mL) and meaningless
--    for orals (a bottle of tabs). `vials` is renamed `inventory_items`
--    and branches across three types via an `inventory_type` enum:
--      - reconstituted   : lyophilised powder + BAC water (peptides, hCG, GH)
--      - preconcentrated : oil/solution at a stated mg/mL (test, tren, mast)
--      - oral_solid      : tablets/capsules at a stated mg per unit (dbol, AIs)
--    Internal name is generic; the UI can still say "vial" for injectables
--    and "bottle" for orals.
--  FIX B - `amount_remaining` is no longer a stored, trigger-mutated column
--    (which violated the file's own "never store derived values" rule and
--    silently desynced on dose edits). Remaining is now DERIVED in
--    v_inventory_math from total minus the sum of taken doses. The
--    apply_dose_to_vial trigger pair is deleted. Edits, undos and skips
--    now reflow automatically with zero drift.
--  DECISIONS STUBBED (see inline NOTE blocks):
--    - RLS policies wrap auth.uid() as (SELECT auth.uid()) for planner
--      caching — applied everywhere.
--    - half_life_hours added to compounds (nullable; for the v1.5
--      theoretical-level curve; unused in v1).
--    - single-active-cycle hard limit provided as a commented index —
--      DECIDE against the paid tier before enabling.
--    - bloodwork unit storage strategy documented at biomarker_results.
--
--  -- HOW TO READ THIS FILE ----------------------------------------
--  Sections are ordered by dependency. Run top to bottom. Conventions:
--    - Store source facts, never derived values (see the VIEWs).
--    - Inventory is tracked in a single base unit per item (mg or iu);
--      doses are logged in mg / mcg / iu and converted to base.
--    - RLS on every user-owned table; (SELECT auth.uid()) = owner.
--    - date_of_birth stored, age derived. Latest body_metrics row is the
--      live weight/body-fat; profiles holds the onboarding snapshot.
--
--  -- TABLE OF CONTENTS --------------------------------------------
--    0.  Supabase-provided objects (reference only — do NOT run)
--    1.  Shared helpers            (set_updated_at)
--    2.  profiles + enums          [flow 1: onboarding]
--    3.  compounds, cycles,
--        protocol_compounds,
--        inventory_items,
--        v_inventory_math          [flow 3: add compound + reconstitution]
--    4.  dose_logs                 [flow 4: logging a dose]
--    5.  bloodwork (biomarkers,
--        lab_panels, results,
--        v_biomarker_position)     [flow 7: bloodwork upload]
--    6.  body_metrics + journal +
--        markers + readings        [flow 9: progress / analytics]
--    7.  notification_preferences,
--        push_subscriptions        [flow 10: settings]
--
--  -- NOT YET MODELLED (deferred, by design) -----------------------
--    - subscriptions / billing — model with the Stripe flow. Will need:
--      stripe_customer_id, stripe_subscription_id, price_id, status,
--      current_period_end, founding_member flag + founding-cohort counter.
--      (The entitlement itself now lives on profiles.tier — see ADD 1.
--      Founding-member is a BILLING concept; entitlement-wise it's 'paid'.)
--    - nutrition (activity level, macros, dietary prefs) — CUT from v1.
--    - dose titration over time (ramping doses within one run) — v1.5.
--    - custom user-created compounds — v1.5.
-- ============================================================


-- ============================================================
--  SECTION 0 — SUPABASE-PROVIDED OBJECTS  (reference only — DO NOT RUN)
-- ============================================================
--  In production Supabase provides auth.users, auth.uid(), and the
--  'authenticated' role. The block below is what we stub locally to test
--  this file against a vanilla Postgres. Left commented so this file
--  applies cleanly on real Supabase.
--
--  CREATE SCHEMA IF NOT EXISTS auth;
--  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
--  CREATE ROLE authenticated;
--  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
--      AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;


-- ============================================================
--  SECTION 1 — SHARED HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;



-- ============================================================
--  SECTION 2 — PROFILES + ENUMS  [flow 1: onboarding]
-- ============================================================

CREATE TYPE sex_type AS ENUM ('male', 'female');

-- Units preference — DISPLAY ONLY.
CREATE TYPE units_pref AS ENUM ('metric', 'imperial');

-- Entitlement tier (ADD 1). Feature gates check this column and nothing
-- else; Stripe webhooks (post-beta) are its only writer besides admin.
-- Founding-member pricing is a billing concept (deferred subscriptions
-- table) — founding members are simply 'paid' here.
CREATE TYPE user_tier AS ENUM ('free', 'paid');

-- Goal. THIS IS THE WEDGE. Milligram's goals were wellness-generic
-- (fat loss / longevity / sexual health / skin) because they serve
-- GLP-1 + biohacker + TRT simultaneously. Yours speak bodybuilder.
CREATE TYPE goal_type AS ENUM (
  'bulk',          -- mass/strength focus, surplus
  'cut',           -- fat loss, preserve muscle
  'recomp',        -- simultaneous
  'contest_prep',  -- competition prep (drives v2 "prep mode")
  'first_cycle',   -- first-timer; affects onboarding tone/defaults
  'blast_cruise',  -- enhanced lifter cycling on/off
  'trt',           -- hormone optimisation / replacement
  'other'
);

-- Acquisition source. For YOU this is attribution infrastructure,
-- not funnel theatre — your distribution is creator-driven. Pair this
-- with referral_code + a PostHog signup event carrying the source.
CREATE TYPE acquisition_source AS ENUM (
  'instagram',
  'tiktok',
  'youtube',
  'friend_referral',
  'creator',       -- generic creator; specific creator via referral_code
  'google',
  'reddit',
  'other'
);


-- ----------------------------------------------------------------
-- PROFILES TABLE
-- ----------------------------------------------------------------
CREATE TABLE profiles (
    -- Identity ---------------------------------------------------
    id                  uuid PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Onboarding personalisation fields (from flow 1) -----------
    sex                 sex_type,
    date_of_birth       date,           -- derive age; never store age
    height_cm           numeric(5,1),   -- e.g. 188.0
    weight_kg           numeric(5,1),   -- e.g. 95.0  (onboarding snapshot; history in body_metrics)
    body_fat_pct        numeric(4,1),   -- e.g. 11.0  (estimate at onboarding)
    goal                goal_type,
    units_preference    units_pref      NOT NULL DEFAULT 'metric',
    -- IANA tz name (e.g. 'Australia/Canberra'), captured from the browser
    -- at onboarding via Intl.DateTimeFormat().resolvedOptions().timeZone.
    -- Needed by scheduled Edge Functions (push reminders, low-inventory)
    -- to resolve local dose_times; client display uses the device tz.
    -- Functions fall back to UTC while null (pre-onboarding).
    timezone            text,

    -- Entitlements (ADD 1) ---------------------------------------
    -- BETA: defaults 'paid' so testers get everything. Flip the default
    -- to 'free' before public launch; Stripe webhooks then own this.
    tier                user_tier       NOT NULL DEFAULT 'paid',

    -- Attribution ----------------------------------------------
    acquisition_source  acquisition_source,
    referral_code       text,           -- ties signup to a specific creator

    -- Legal / age gate (Milligram had no explicit gate — this is ours)
    is_18_plus          boolean         NOT NULL DEFAULT false,
    tos_accepted_at     timestamptz,    -- timestamp = proof of acceptance
    tos_version         text,           -- which ToS version they accepted

    -- Lifecycle -------------------------------------------------
    onboarding_completed_at  timestamptz,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    -- Guardrails ------------------------------------------------
    CONSTRAINT body_fat_sane CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 70)),
    CONSTRAINT height_sane   CHECK (height_cm  IS NULL OR (height_cm  >= 100 AND height_cm  <= 250)),
    CONSTRAINT weight_sane   CHECK (weight_kg  IS NULL OR (weight_kg  >= 30  AND weight_kg  <= 300))
);


-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------
-- NOTE (perf): auth.uid() is wrapped as (SELECT auth.uid()) in every
-- policy. Postgres re-evaluates a bare function call per row; the
-- subquery form lets the planner cache it once per statement. This is a
-- known Supabase RLS optimisation and belongs in the Code Standards file
-- as the house pattern. Confirm against current Supabase RLS docs.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile - select"
    ON profiles FOR SELECT
    USING ((SELECT auth.uid()) = id);

CREATE POLICY "own profile - insert"
    ON profiles FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "own profile - update"
    ON profiles FOR UPDATE
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);

-- No DELETE policy = users can't delete their profile row directly.
-- Account deletion cascades from auth.users instead (handled server-side).


-- ----------------------------------------------------------------
-- AUTO-UPDATE updated_at
-- ----------------------------------------------------------------
CREATE TRIGGER profiles_set_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------
-- AUTO-CREATE profile row on signup
-- ----------------------------------------------------------------
-- Fires when Supabase Auth creates a new user. Creates the empty profile
-- row (is_18_plus defaults false, tos_accepted_at null) so onboarding
-- just UPDATEs it. NB: "profile exists" != "passed age gate" — gate app
-- access on is_18_plus AND tos_accepted_at until onboarding completes.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
    -- ON CONFLICT makes this idempotent: a retry or race can't raise and
    -- thereby break the auth.users insert (a throwing trigger here blocks
    -- ALL signups). NB a successful no-op still leaves a profile row in place.
    INSERT INTO public.profiles (id) VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
--  SECTION 3 — COMPOUNDS / CYCLES / PROTOCOL_COMPOUNDS / INVENTORY [flow 3]
-- ============================================================

CREATE TYPE admin_route AS ENUM ('po', 'subq', 'im', 'nasal', 'topical');

-- Compound category. THIS IS THE WEDGE (see flow 1/2 analysis).
-- Milligram's taxonomy is peptide-native. Ours treats all five as equal
-- top-level citizens. Ancillaries are protocol-critical and absent there.
CREATE TYPE compound_category AS ENUM (
  'anabolic',     -- injectable AAS: test, tren, deca, etc.
  'oral',         -- oral AAS: dbol, anavar, winstrol, etc.
  'peptide',      -- BPC-157, TB-500, GHRPs, GLP-1s, etc.
  'ancillary',    -- AIs, SERMs, hCG — critical for AAS users
  'supplement'    -- vitamins, minerals, OTC support
);

-- Dose / measurement units. Used for dose_amount, inventory base unit,
-- and inventory total unit. NB: logged doses are restricted to the
-- mass/activity units (mg/mcg/iu) when the log is inventory-backed, so
-- depletion maths stay convertible (see dose_logs CHECK).
CREATE TYPE dose_unit AS ENUM ('mg', 'mcg', 'iu', 'ml', 'tab', 'capsule');

-- How the physical inventory is held & measured. Drives the add form and
-- the depletion maths. THIS IS THE FIX-A BRANCH.
CREATE TYPE inventory_type AS ENUM (
  'reconstituted',    -- lyophilised powder + BAC water -> derive concentration
  'preconcentrated',  -- oil/solution at a stated mg/mL (no reconstitution)
  'oral_solid'        -- tablets/capsules at a stated mg per unit
);

-- Schedule shape. Milligram: every day / specific days / every N days,
-- plus times-per-day.
CREATE TYPE schedule_type AS ENUM ('every_day', 'specific_days', 'every_n_days');


-- ----------------------------------------------------------------
-- COMPOUNDS  (global reference library — not user-owned)
-- ----------------------------------------------------------------
-- Seeded by us. Users select from this; they don't create rows here
-- (custom-compound path is v1.5).
CREATE TABLE compounds (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL UNIQUE,          -- "Retatrutide", "Testosterone Enanthate"
    category        compound_category NOT NULL,
    -- defaults to pre-fill the add form (all optional/nullable):
    default_unit    dose_unit,
    default_route   admin_route,
    default_inventory_type inventory_type,         -- pre-selects the form branch (FIX A)
    aliases         text[],                        -- ["Reta","LY3437943"] for search
    -- half-life in hours. UNUSED IN v1. Present so the v1.5 honestly-
    -- labelled theoretical-level curve has a reference value to model from.
    half_life_hours numeric(8,2),
    created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE compounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compounds readable by all authed users"
    ON compounds FOR SELECT TO authenticated USING (true);
-- (No insert/update/delete policy => only service role / seeding can write.)


-- ----------------------------------------------------------------
-- CYCLES  (Trackd wrapper — Milligram has no equivalent)
-- ----------------------------------------------------------------
-- Beta scope = NO cycle cap of any kind (see header NOTE + the decision
-- stub below). Whether free tier enforces 1 active cycle is decided
-- post-beta; nothing is enforced here yet.
--
-- ARCHIVE, NEVER HARD-DELETE: deleting a cycle row CASCADES through
-- protocol_compounds -> inventory_items -> dose_logs, destroying every dose
-- and injection-site record inside it (the moat). The app MUST archive a
-- cycle by setting is_active = false and must never expose a hard delete.
-- The cascade is kept deliberately so that ACCOUNT deletion
-- (auth.users -> profiles -> cascade) still fully erases a user's data on
-- request — switching it to RESTRICT would break that path.
CREATE TABLE cycles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            text NOT NULL DEFAULT 'My Cycle',   -- "Summer Cut 2026"
    started_on      date,
    ended_on        date,                              -- null = ongoing
    is_active       boolean NOT NULL DEFAULT true,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cycles - all" ON cycles FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE TRIGGER cycles_updated_at BEFORE UPDATE ON cycles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_cycles_user_active ON cycles(user_id, is_active);

-- DECISION (stub): hard single-active-cycle limit at the DB level.
-- The free tier allows 1 active cycle. If the paid tier also runs one
-- active cycle at a time (typical for bodybuilders — you're on or off),
-- enable the index below and gate TOTAL cycle count in app. If paid
-- genuinely allows multiple SIMULTANEOUS active cycles, DO NOT enable
-- it; enforce the free-tier cap in app logic instead. Left off until you
-- decide, because a global unique-active index is wrong for that case.
-- BETA POSTURE (Jun 2026): index stays OFF. Testers get unlimited cycles
-- with no DB-level cap of any kind. Whether the beta UI supports multiple
-- SIMULTANEOUS active cycles is an app-layer decision (dashboard/calendar
-- must merge schedules across actives if so). Observed tester behaviour
-- feeds the paid-tier decision before anything is enforced here.
-- CREATE UNIQUE INDEX one_active_cycle_per_user
--     ON cycles(user_id) WHERE is_active;


-- ----------------------------------------------------------------
-- PROTOCOL_COMPOUNDS  (a compound the user is actually running)
-- ----------------------------------------------------------------
-- The join of user + compound + their specific dose & schedule, inside a
-- cycle. This is what Milligram's "dose entry" screen creates.
CREATE TABLE protocol_compounds (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    cycle_id        uuid NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
    compound_id     uuid NOT NULL REFERENCES compounds(id),

    -- Dose per administration (period is implied by schedule). Logged in
    -- mass/activity units so it converts to the inventory base unit.
    dose_amount     numeric(10,3) NOT NULL,         -- 1.000
    dose_unit       dose_unit NOT NULL,             -- mg / mcg / iu
    route           admin_route NOT NULL,           -- subq / im / po ...

    -- Schedule (every day / specific days / every N days)
    schedule_type   schedule_type NOT NULL DEFAULT 'every_day',
    days_of_week    smallint[],                     -- {1,3,5}=Mon/Wed/Fri; specific_days only
    interval_days   smallint,                       -- e.g. 3; every_n_days only
    times_per_day   smallint NOT NULL DEFAULT 1,    -- 1/2/3
    dose_times      time[] NOT NULL DEFAULT '{08:00}', -- one time per times_per_day

    -- Window (compounds can run for different windows inside the cycle —
    -- kickstart oral weeks 1-4, injectable base weeks 1-12, PCT after)
    first_dose_on   date NOT NULL,
    end_date        date,                           -- optional

    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dose_positive CHECK (dose_amount > 0),
    CONSTRAINT times_per_day_sane CHECK (times_per_day BETWEEN 1 AND 6),
    -- schedule integrity: the right supporting column must be present.
    -- specific_days additionally needs >= 1 day — '{}' is non-null, and
    -- COALESCE matters again (array_length('{}') is NULL; NULL passes a CHECK)
    CONSTRAINT schedule_shape CHECK (
        (schedule_type = 'every_day')
        OR (schedule_type = 'specific_days' AND days_of_week IS NOT NULL
            AND COALESCE(array_length(days_of_week, 1), 0) >= 1)
        OR (schedule_type = 'every_n_days'  AND interval_days IS NOT NULL)
    ),
    -- FIX E: one dose time per times_per_day. COALESCE matters —
    -- array_length('{}') is NULL and a NULL CHECK passes, so an empty
    -- array would otherwise slip through.
    CONSTRAINT dose_times_match CHECK (
        COALESCE(array_length(dose_times, 1), 0) = times_per_day
    ),
    -- FIX E: days are ISO weekday numbers, Mon=1 .. Sun=7
    CONSTRAINT days_of_week_valid CHECK (
        days_of_week IS NULL OR days_of_week <@ '{1,2,3,4,5,6,7}'::smallint[]
    ),
    -- FIX E: every-N-days needs N >= 1 (view math already NULLIFs 0,
    -- but a negative interval would produce a negative cadence)
    CONSTRAINT interval_days_valid CHECK (
        interval_days IS NULL OR interval_days >= 1
    )
);
ALTER TABLE protocol_compounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own protocol_compounds - all" ON protocol_compounds FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE TRIGGER protocol_compounds_updated_at BEFORE UPDATE ON protocol_compounds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_protocol_compounds_cycle ON protocol_compounds(cycle_id);
CREATE INDEX idx_protocol_compounds_user  ON protocol_compounds(user_id);


-- ----------------------------------------------------------------
-- INVENTORY_ITEMS  (the longitudinal supply loop — was `vials`)  [FIX A]
-- ----------------------------------------------------------------
-- One protocol_compound -> many inventory items over time (refills create
-- a NEW row, never overwrite — consumption history is the moat).
--
-- Stores ONLY raw inputs. Everything derived (concentration, mL/units per
-- dose, doses remaining, projected empty) lives in v_inventory_math.
--
-- The three types and the fields each one uses:
--   reconstituted   : total_amount = mg|iu of active powder; bac_water_ml set.
--                     concentration = total_amount / bac_water_ml.
--   preconcentrated : total_amount = mL of solution; concentration_mg_per_ml set
--                     (stated by manufacturer). total mg = mL * mg/mL.
--   oral_solid      : total_amount = count of units; strength_per_unit_mg set.
--                     total mg = units * mg/unit.
-- base_unit is the unit remaining/doses are computed in: 'mg' for oils &
-- orals & mg-peptides; 'iu' for iu-dosed compounds (GH, some peptides).
CREATE TABLE inventory_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    protocol_compound_id uuid NOT NULL REFERENCES protocol_compounds(id) ON DELETE CASCADE,

    inventory_type      inventory_type NOT NULL,
    base_unit           dose_unit NOT NULL,         -- 'mg' or 'iu' (tracking base)

    -- generic capacity input; its meaning depends on inventory_type (see above)
    total_amount        numeric(10,3) NOT NULL,
    total_amount_unit   dose_unit NOT NULL,         -- 'mg'/'iu' | 'ml' | 'tab'/'capsule'

    -- type-specific discriminators (exactly one set is populated; CHECK enforces)
    bac_water_ml            numeric(10,3),          -- reconstituted only
    concentration_mg_per_ml numeric(10,3),          -- preconcentrated only (stated)
    strength_per_unit_mg    numeric(10,3),          -- oral_solid only (mg per tab/cap)

    reconstituted_on    date,                       -- reconstituted: mix date
    acquired_on         date DEFAULT current_date,  -- when this item started being used
    is_active           boolean NOT NULL DEFAULT true, -- false once empty/discarded

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT total_positive CHECK (total_amount > 0),
    CONSTRAINT bac_positive   CHECK (bac_water_ml IS NULL OR bac_water_ml > 0),
    CONSTRAINT conc_positive  CHECK (concentration_mg_per_ml IS NULL OR concentration_mg_per_ml > 0),
    CONSTRAINT strength_positive CHECK (strength_per_unit_mg IS NULL OR strength_per_unit_mg > 0),

    -- the discriminated-union guard: each type uses exactly its own fields
    CONSTRAINT inv_type_fields CHECK (
        (inventory_type = 'reconstituted'
            AND bac_water_ml IS NOT NULL
            AND concentration_mg_per_ml IS NULL
            AND strength_per_unit_mg IS NULL
            AND base_unit IN ('mg','iu')
            -- FIX D: the powder's stated amount IS the tracking base —
            -- the two units can't coherently differ for this type
            AND total_amount_unit = base_unit)
        OR
        (inventory_type = 'preconcentrated'
            AND concentration_mg_per_ml IS NOT NULL
            AND bac_water_ml IS NULL
            AND strength_per_unit_mg IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit = 'ml')
        OR
        (inventory_type = 'oral_solid'
            AND strength_per_unit_mg IS NOT NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit IN ('tab','capsule'))
    )
);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inventory_items - all" ON inventory_items FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_inventory_protocol_compound ON inventory_items(protocol_compound_id);
CREATE INDEX idx_inventory_active ON inventory_items(user_id, is_active);


-- ----------------------------------------------------------------
-- UNIT-FAMILY INTEGRITY  (FIX C — DB-enforced, both ends)
-- ----------------------------------------------------------------
-- v_inventory_math only converts mcg->mg; mg and iu pass through. A
-- cross-family dose (iu against an mg-tracked item, or vice versa) would
-- therefore subtract a raw magnitude from the wrong base — a silently
-- wrong "remaining" with no error. The add form prevents this, but the
-- DB is the source of truth, so it enforces it too. Families:
--   base_unit 'mg'  <- doses in mg or mcg
--   base_unit 'iu'  <- doses in iu
CREATE OR REPLACE FUNCTION unit_family_compatible(
    item_base public.dose_unit,
    dose      public.dose_unit
)
RETURNS boolean AS $$
    SELECT (item_base = 'mg' AND dose IN ('mg','mcg'))
        OR (item_base = 'iu' AND dose = 'iu');
$$ LANGUAGE sql IMMUTABLE;

-- End 1: an inventory item must be family-compatible with its protocol
-- compound's PLANNED dose unit (planned_dose_base in the view passes
-- mg/iu through unconverted, so this guards ml_per_dose/doses_remaining).
CREATE OR REPLACE FUNCTION check_inventory_unit_family()
RETURNS trigger AS $$
DECLARE
    pc_unit public.dose_unit;
BEGIN
    SELECT dose_unit INTO pc_unit
    FROM public.protocol_compounds
    WHERE id = NEW.protocol_compound_id;

    IF pc_unit IS NOT NULL
       AND NOT public.unit_family_compatible(NEW.base_unit, pc_unit) THEN
        RAISE EXCEPTION
            'unit family mismatch: planned dose unit % is incompatible with inventory base unit %',
            pc_unit, NEW.base_unit
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_items_unit_family
    BEFORE INSERT OR UPDATE OF base_unit, protocol_compound_id ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION check_inventory_unit_family();

-- End 2: editing a protocol compound's dose_unit cross-family AFTER
-- inventory exists would reopen the same hole from the other side.
CREATE OR REPLACE FUNCTION check_protocol_unit_family()
RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.inventory_items i
        WHERE i.protocol_compound_id = NEW.id
          AND NOT public.unit_family_compatible(i.base_unit, NEW.dose_unit)
    ) THEN
        RAISE EXCEPTION
            'unit family mismatch: dose unit % is incompatible with an existing inventory item''s base unit',
            NEW.dose_unit
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protocol_compounds_unit_family
    BEFORE UPDATE OF dose_unit ON protocol_compounds
    FOR EACH ROW EXECUTE FUNCTION check_protocol_unit_family();


-- ============================================================
--  SECTION 4 — DOSE LOGGING  [flow 4]
-- ============================================================

CREATE TYPE injection_site AS ENUM (
  'glute_left',      'glute_right',
  'delt_left',       'delt_right',
  'quad_left',       'quad_right',
  'ventroglute_left','ventroglute_right',
  'abdomen_left',    'abdomen_right',
  'lovehandle_left', 'lovehandle_right',
  'other'
);

-- A log is either a dose that was taken, or a due dose explicitly skipped.
-- (A back-filled dose you forgot to tick is just a 'taken' row with an
--  earlier taken_at — not a separate status.) 'skipped' rows do NOT
-- deplete inventory and keep adherence honest without nagging.
CREATE TYPE log_status AS ENUM ('taken', 'skipped');


CREATE TABLE dose_logs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    protocol_compound_id uuid NOT NULL REFERENCES protocol_compounds(id) ON DELETE CASCADE,
    -- which inventory item this dose drew from (so depletion can be derived).
    -- nullable: supplements / non-tracked items may not be inventory-backed.
    inventory_item_id    uuid REFERENCES inventory_items(id) ON DELETE SET NULL,

    status               log_status NOT NULL DEFAULT 'taken',

    -- The actual dose taken. Set by the app (defaults to the protocol_compound's
    -- planned dose) but stored explicitly so an off-plan dose is recorded
    -- truthfully (information-not-judgement: log what happened, not the plan).
    dose_amount          numeric(10,3) NOT NULL,
    dose_unit            dose_unit NOT NULL,

    -- SIGNATURE FEATURE: where it went. Nullable (orals have no site).
    injection_site       injection_site,

    -- When the dose was actually taken (user can adjust; defaults to now).
    taken_at             timestamptz NOT NULL DEFAULT now(),
    -- The scheduled slot this log satisfies, if any — links a fact back to a
    -- predicted-due event for adherence calc without double-counting.
    scheduled_for        timestamptz,

    note                 text,        -- optional per-dose note
    created_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dose_amount_positive CHECK (dose_amount > 0),
    -- inventory-backed logs must be in a mass/activity unit so depletion
    -- converts cleanly to the item's base unit (mg/iu). Family
    -- compatibility with the SPECIFIC item is cross-table, so it's
    -- enforced by the dose_logs_unit_family trigger below (FIX C) —
    -- this CHECK just excludes ml/tab/capsule outright.
    CONSTRAINT inv_backed_dose_unit CHECK (
        inventory_item_id IS NULL OR dose_unit IN ('mg','mcg','iu')
    )
);

ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dose_logs - all" ON dose_logs FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_dose_logs_pc        ON dose_logs(protocol_compound_id);
CREATE INDEX idx_dose_logs_user_time ON dose_logs(user_id, taken_at DESC);
CREATE INDEX idx_dose_logs_inventory ON dose_logs(inventory_item_id);

-- End 3 of FIX C: a logged dose drawing from an inventory item must be
-- family-compatible with that item's base unit (see helper at FIX C).
CREATE OR REPLACE FUNCTION check_dose_log_unit_family()
RETURNS trigger AS $$
DECLARE
    item_base public.dose_unit;
BEGIN
    IF NEW.inventory_item_id IS NULL THEN
        RETURN NEW;        -- not inventory-backed; nothing to deplete
    END IF;

    SELECT base_unit INTO item_base
    FROM public.inventory_items
    WHERE id = NEW.inventory_item_id;

    IF item_base IS NOT NULL
       AND NOT public.unit_family_compatible(item_base, NEW.dose_unit) THEN
        RAISE EXCEPTION
            'unit family mismatch: % dose logged against an item tracked in %',
            NEW.dose_unit, item_base
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dose_logs_unit_family
    BEFORE INSERT OR UPDATE OF dose_unit, inventory_item_id ON dose_logs
    FOR EACH ROW EXECUTE FUNCTION check_dose_log_unit_family();

-- NOTE (FIX B): there is deliberately NO trigger maintaining a stored
-- "remaining" column. Remaining is DERIVED in v_inventory_math from
-- total minus the SUM of taken doses. This means edits, deletes (undo)
-- and skips reflow with zero drift and no INSERT/DELETE/UPDATE trigger
-- paths to keep in sync. After a log write, the client just re-reads
-- v_inventory_math for that item to show the new remaining/countdown.


-- ============================================================
--  SECTION 3b — DERIVED INVENTORY MATH  (a VIEW — never stored columns)
-- ============================================================
-- Reproduces Milligram's "Math" block from raw inputs only, generalised
-- across all three inventory types, and adds the projected-empty estimate
-- their model can't compute against a cycle.
--
-- Outputs (all derived):
--   concentration_per_ml   mg/mL for injectables (NULL for oral)
--   ml_per_dose            mL to draw per planned dose (injectables)
--   units_per_dose         insulin units per dose (1 mL = 100 U)
--   units_per_dose_oral    tabs/caps per planned dose (oral)
--   total_base             full capacity in the item's base unit
--   remaining_base         total_base - sum(taken doses), clamped >= 0
--   remaining_display      human measure left: mL (injectables) / tabs (oral)
--   doses_remaining        whole planned doses left in the item
--   est_doses_per_week     rough cadence from the schedule (estimate)
--   est_empty_date         approximate reorder date (estimate, NOT exact —
--                          specific-days schedules are treated as a flat
--                          weekly rate; precise calendar projection is
--                          better done in the low-inventory Edge Function)
--
-- NOTE: this view returns a row for EVERY inventory item, including
-- is_active = false (emptied/discarded) ones. The app must filter on
-- is_active when showing "current" inventory so a discarded vial does
-- not appear on the dashboard.
CREATE VIEW v_inventory_math
    WITH (security_invoker = true)   -- SEC 1: evaluate underlying RLS as
                                     -- the CALLING user, never the owner
AS
WITH consumed AS (
    SELECT
        dl.inventory_item_id,
        -- sum each taken dose converted into the base unit. Only mcg->mg
        -- needs scaling; mg and iu pass through. Cross-family doses are
        -- rejected at the DB layer by dose_logs_unit_family (FIX C), so
        -- pass-through here is safe by construction.
        SUM(
            CASE dl.dose_unit
                WHEN 'mcg' THEN dl.dose_amount / 1000.0
                ELSE dl.dose_amount
            END
        ) AS consumed_base
    FROM dose_logs dl
    WHERE dl.status = 'taken' AND dl.inventory_item_id IS NOT NULL
    GROUP BY dl.inventory_item_id
)
SELECT
    base.*,
    -- mL to draw per dose (injectables only)
    CASE WHEN base.concentration_per_ml IS NULL OR base.concentration_per_ml = 0
         THEN NULL
         ELSE round(base.planned_dose_base / base.concentration_per_ml, 3)
    END AS ml_per_dose,
    -- insulin units per dose (1 mL = 100 U)
    CASE WHEN base.concentration_per_ml IS NULL OR base.concentration_per_ml = 0
         THEN NULL
         ELSE round((base.planned_dose_base / base.concentration_per_ml) * 100, 1)
    END AS units_per_dose,
    -- tabs/caps per dose (oral only)
    CASE WHEN base.inventory_type = 'oral_solid' AND base.strength_per_unit_mg > 0
         THEN round(base.planned_dose_base / base.strength_per_unit_mg, 2)
         ELSE NULL
    END AS units_per_dose_oral,
    -- whole planned doses remaining
    CASE WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0
         THEN NULL
         ELSE floor(base.remaining_base / base.planned_dose_base)
    END AS doses_remaining,
    -- human-friendly remaining in the container's own measure
    CASE base.inventory_type
        WHEN 'preconcentrated' THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 2)
        WHEN 'reconstituted'   THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 3)
        WHEN 'oral_solid'      THEN floor(base.remaining_base / NULLIF(base.strength_per_unit_mg,0))
    END AS remaining_display,
    -- approximate empty date for the reorder prompt (estimate only)
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE current_date
             + (( floor(base.remaining_base / base.planned_dose_base)
                  / base.est_doses_per_week ) * 7)::int
    END AS est_empty_date
FROM (
    SELECT
        i.id AS inventory_item_id,
        i.protocol_compound_id,
        i.inventory_type,
        i.base_unit,
        i.strength_per_unit_mg,
        pc.dose_amount,
        pc.dose_unit,
        -- planned dose expressed in the item's base unit
        CASE pc.dose_unit WHEN 'mcg' THEN pc.dose_amount / 1000.0 ELSE pc.dose_amount END
            AS planned_dose_base,
        -- total capacity in base unit, per type
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN i.total_amount
            WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
            WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
        END AS total_base,
        -- remaining = total - consumed, clamped at 0 (DERIVED, never stored)
        GREATEST(
            (CASE i.inventory_type
                WHEN 'reconstituted'   THEN i.total_amount
                WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
                WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
             END) - COALESCE(c.consumed_base, 0),
            0
        ) AS remaining_base,
        -- concentration: derived for reconstituted, stated for preconcentrated
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN CASE WHEN i.bac_water_ml > 0
                                             THEN round(i.total_amount / i.bac_water_ml, 3) END
            WHEN 'preconcentrated' THEN i.concentration_mg_per_ml
            ELSE NULL
        END AS concentration_per_ml,
        -- rough weekly cadence from the schedule (estimate for reorder date)
        CASE pc.schedule_type
            WHEN 'every_day'     THEN 7.0 * pc.times_per_day
            WHEN 'specific_days' THEN COALESCE(array_length(pc.days_of_week, 1), 0) * pc.times_per_day
            WHEN 'every_n_days'  THEN (7.0 / NULLIF(pc.interval_days, 0)) * pc.times_per_day
        END AS est_doses_per_week
    FROM inventory_items i
    JOIN protocol_compounds pc ON pc.id = i.protocol_compound_id
    LEFT JOIN consumed c ON c.inventory_item_id = i.id
) base;


-- ============================================================
--  SECTION 5 — BLOODWORK  [flow 7]
-- ============================================================

CREATE TYPE biomarker_category AS ENUM (
  'hormones',      -- test, estradiol, LH, FSH, prolactin, SHBG
  'lipids',        -- total chol, LDL, HDL, triglycerides
  'liver',         -- ALT, AST, GGT, bilirubin
  'kidney',        -- creatinine, eGFR, BUN
  'blood_count',   -- haematocrit, haemoglobin, RBC (key for AAS users)
  'metabolic',     -- glucose, HbA1c, insulin
  'thyroid',       -- TSH, T3, T4
  'other'
);


-- ----------------------------------------------------------------
-- BIOMARKERS  (reference catalogue — not user-owned)
-- ----------------------------------------------------------------
-- Lets manual entry autocomplete, and lets us attach reference ranges
-- even when the lab didn't print them. Ranges are sex-specific. The
-- alt-unit conversion factor lives here (per-analyte) for v1.5 trends.
CREATE TABLE biomarkers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL UNIQUE,      -- "Total Testosterone"
    category          biomarker_category NOT NULL,
    canonical_unit    text NOT NULL,             -- SI unit, e.g. "nmol/L"
    alt_unit          text,                      -- e.g. "ng/dL"
    alt_unit_factor   numeric(12,5),             -- canonical * factor = alt (e.g. 28.84 for test)
    ref_low_male      numeric(12,4),
    ref_high_male     numeric(12,4),
    ref_low_female    numeric(12,4),
    ref_high_female   numeric(12,4),
    aliases           text[],                    -- ["Test","TT"] for search
    created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE biomarkers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biomarkers readable by all authed" ON biomarkers
    FOR SELECT TO authenticated USING (true);


-- ----------------------------------------------------------------
-- LAB_PANELS  (one uploaded report / one blood draw)
-- ----------------------------------------------------------------
CREATE TABLE lab_panels (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- link to the cycle this draw falls in, for longitudinal context
    cycle_id        uuid REFERENCES cycles(id) ON DELETE SET NULL,
    drawn_on        date,                        -- date of blood draw
    provider        text,                        -- lab name
    -- uploaded source file in Supabase Storage (path, not bytes).
    -- CONVENTION: "<auth.uid()>/<panel_id>/<filename>" — the first path
    -- segment MUST be the owner's uid (enforced by the storage.objects
    -- policies in trackd_storage_policies.sql). This column is free text;
    -- the app is responsible for writing a path that matches that
    -- convention and the actual uploaded object.
    source_file_path text,                       -- "user_id/panel_id/report.pdf"
    notes           text,
    -- provenance: AI-extracted (v1.5) or manual (v1). Same tables either way.
    extraction_source text NOT NULL DEFAULT 'manual'
        CHECK (extraction_source IN ('manual', 'ai')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lab_panels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lab_panels - all" ON lab_panels FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE TRIGGER lab_panels_updated_at BEFORE UPDATE ON lab_panels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_lab_panels_user ON lab_panels(user_id, drawn_on DESC);


-- ----------------------------------------------------------------
-- BIOMARKER_RESULTS  (individual marker values within a panel)
-- ----------------------------------------------------------------
-- DECISION (stub) — unit storage: values are stored AS ENTERED, with the
-- unit alongside, and the reference range is COPIED in at entry time (so a
-- later edit to the biomarkers catalogue can't silently rewrite history).
-- This preserves fidelity and matches Milligram's proven model. Trade-off:
-- when v1.5 plots a marker across multiple draws, the trend code MUST
-- convert catalogue markers to canonical at query time using
-- biomarkers.alt_unit_factor. Custom markers (biomarker_id NULL) are
-- assumed entered in one consistent unit per user — cross-unit custom
-- trends are out of scope. Revisit only if that assumption breaks.
CREATE TABLE biomarker_results (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    panel_id        uuid NOT NULL REFERENCES lab_panels(id) ON DELETE CASCADE,
    -- link to the reference biomarker (null if user typed a custom one)
    biomarker_id    uuid REFERENCES biomarkers(id),

    name            text NOT NULL,               -- denormalised label as entered
    category        biomarker_category NOT NULL,
    value_numeric   numeric(14,4),               -- 35.2  (null if descriptive)
    value_text      text,                        -- "Negative" / "<5.0" for non-numeric
    unit            text,                        -- "nmol/L" as entered

    -- reference range as it applied to THIS result (copied at entry)
    ref_low         numeric(14,4),
    ref_high        numeric(14,4),

    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT has_a_value CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);
ALTER TABLE biomarker_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own biomarker_results - all" ON biomarker_results FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX idx_biomarker_results_panel ON biomarker_results(panel_id);
CREATE INDEX idx_biomarker_results_trend ON biomarker_results(user_id, biomarker_id, created_at);


-- ----------------------------------------------------------------
-- RANGE POSITION  (derived, NOT stored — categorical, not evaluative)
-- ----------------------------------------------------------------
-- Exposes whether a value sits below/within/above its reference range as a
-- NEUTRAL CATEGORY, never a judgement. An above-range test reading is
-- EXPECTED for an enhanced athlete — "above" is a fact, "high/bad" is a
-- judgement we never make. The UI decides display; the data stays factual.
CREATE VIEW v_biomarker_position
    WITH (security_invoker = true)   -- SEC 1: evaluate underlying RLS as
                                     -- the CALLING user, never the owner
AS
SELECT
    r.id AS result_id,
    r.user_id,
    r.name,
    r.value_numeric,
    r.ref_low,
    r.ref_high,
    CASE
        WHEN r.value_numeric IS NULL OR r.ref_low IS NULL OR r.ref_high IS NULL THEN 'unknown'
        WHEN r.value_numeric < r.ref_low  THEN 'below'
        WHEN r.value_numeric > r.ref_high THEN 'above'
        ELSE 'within'
    END AS range_position
FROM biomarker_results r;


-- ============================================================
--  SECTION 6 — BODY METRICS + JOURNAL + MARKERS  [flow 9]
-- ============================================================

CREATE TABLE body_metrics (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    measured_on   date NOT NULL DEFAULT current_date,
    weight_kg     numeric(5,1),
    body_fat_pct  numeric(4,1),
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT bm_weight_sane   CHECK (weight_kg  IS NULL OR (weight_kg  >= 30 AND weight_kg <= 300)),
    CONSTRAINT bm_bodyfat_sane  CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 70)),
    CONSTRAINT bm_one_per_day   UNIQUE (user_id, measured_on)
);
ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own body_metrics - all" ON body_metrics FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX idx_body_metrics_trend ON body_metrics(user_id, measured_on);


-- ----------------------------------------------------------------
-- MARKERS  (curated catalogue of trackable subjective markers)
-- ----------------------------------------------------------------
-- Milligram's set is GLP-1-flavoured (food noise, satiety, craving). Ours
-- defaults to bodybuilding-relevant markers; the mechanic is identical.
-- SIDE EFFECTS live here too: negative-polarity markers (acne, soreness,
-- insomnia, night sweats...). A two-tier marker {'None','Present'} behaves
-- as a daily checklist item — same mechanic, no separate table. Decide the
-- v1 representation (tiers vs checklist labels) in UI Context.
CREATE TYPE marker_polarity AS ENUM ('positive', 'negative', 'neutral');
-- positive = higher is "more of a good thing" (energy, libido)
-- negative = higher is "more of a bad thing" (soreness, acne)
-- NOTE: polarity is for CHART AXIS ORIENTATION ONLY, never for judgement
-- colour. Categorical-not-evaluative holds: we don't red-flag a "negative"
-- marker, we just know which way "up" means on its axis.

CREATE TABLE markers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL UNIQUE,     -- "Energy", "Pumps", "Libido"
    polarity     marker_polarity NOT NULL DEFAULT 'neutral',
    -- ordered tier labels low->high. Display the WORD, store the INDEX.
    -- e.g. {'Drained','Flat','Coasting','Charged','Wired'} (index 1..5)
    tier_labels  text[] NOT NULL,
    is_default   boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markers readable by all authed" ON markers
    FOR SELECT TO authenticated USING (true);


-- User's selected markers (which of the catalogue they track + custom).
CREATE TABLE user_markers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    marker_id    uuid REFERENCES markers(id),       -- null if fully custom
    custom_name  text,                              -- for user's own marker
    custom_tier_labels text[],                      -- for fully-custom markers
    sort_order   smallint NOT NULL DEFAULT 0,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT marker_ref_or_custom CHECK (marker_id IS NOT NULL OR custom_name IS NOT NULL)
);
ALTER TABLE user_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_markers - all" ON user_markers FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);


-- ----------------------------------------------------------------
-- JOURNAL_ENTRIES  (one per day)
-- ----------------------------------------------------------------
CREATE TABLE journal_entries (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    cycle_id     uuid REFERENCES cycles(id) ON DELETE SET NULL,  -- ties journal to cycle timeline
    entry_date   date NOT NULL DEFAULT current_date,
    free_text    text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT one_entry_per_day UNIQUE (user_id, entry_date)
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal_entries - all" ON journal_entries FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE TRIGGER journal_entries_updated_at BEFORE UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_journal_entries_user ON journal_entries(user_id, entry_date DESC);


-- ----------------------------------------------------------------
-- MARKER_READINGS  (a marker's value on a given day's entry)
-- ----------------------------------------------------------------
-- KEY PATTERN: store the ordinal tier_value (chartable), display the
-- matching word from tier_labels (human-readable).
CREATE TABLE marker_readings (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entry_id      uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_marker_id uuid NOT NULL REFERENCES user_markers(id) ON DELETE CASCADE,
    tier_value    smallint NOT NULL,             -- ordinal index into tier_labels (1..N)
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tier_value_positive CHECK (tier_value >= 1),
    -- NOTE: the UPPER bound (tier_value <= length of the marker's
    -- tier_labels / custom_tier_labels) is cross-table — enforced at the
    -- app layer, not here. Display code must clamp defensively.
    CONSTRAINT one_reading_per_marker_per_entry UNIQUE (entry_id, user_marker_id)
);
ALTER TABLE marker_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own marker_readings - all" ON marker_readings FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX idx_marker_readings_trend ON marker_readings(user_id, user_marker_id, created_at);


-- ============================================================
--  SECTION 7 — NOTIFICATION PREFERENCES  [flow 10]
-- ============================================================

CREATE TYPE reminder_lead AS ENUM ('on_time', 'min_10', 'min_30', 'hour_1');
CREATE TYPE unlogged_wait AS ENUM ('min_30', 'hour_1', 'hour_2', 'hour_4');

CREATE TABLE notification_preferences (
    user_id              uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

    -- Dose reminders
    dose_reminders_on    boolean NOT NULL DEFAULT true,
    dose_reminder_lead   reminder_lead NOT NULL DEFAULT 'on_time',

    -- Unlogged-dose alert (dose was due, not yet ticked)
    unlogged_alert_on    boolean NOT NULL DEFAULT true,
    unlogged_alert_wait  unlogged_wait NOT NULL DEFAULT 'hour_2',

    -- Other reminders
    daily_journal_reminder_on boolean NOT NULL DEFAULT false,
    weekly_recap_on      boolean NOT NULL DEFAULT true,
    -- low-inventory alert (flow-6 feature: "X running low") tied to
    -- v_inventory_math.est_empty_date, fired by a scheduled Edge Function.
    low_inventory_alert_on boolean NOT NULL DEFAULT true,

    sound_on             boolean NOT NULL DEFAULT true,

    updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notif prefs - all" ON notification_preferences FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE TRIGGER notif_prefs_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Create a default prefs row when a profile is created.
CREATE OR REPLACE FUNCTION handle_new_profile_prefs()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_profile_created_prefs
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION handle_new_profile_prefs();


-- ----------------------------------------------------------------
-- PUSH_SUBSCRIPTIONS  (Web Push delivery targets — one row per device)  [ADD 3]
-- ----------------------------------------------------------------
-- notification_preferences says WHAT a user wants; this says WHERE to
-- send it. One row per browser/device subscription — a user with the PWA
-- installed on phone + laptop has two rows. Written by the client when
-- push permission is granted; READ by the scheduled Edge Function via
-- service role (bypasses RLS). The PushSubscription object is decomposed
-- into columns (never stored as opaque JSON) because the sender needs
-- endpoint/p256dh/auth individually to encrypt against VAPID keys.
-- Lifecycle: refresh last_seen_at on app open; DELETE the row when a send
-- returns HTTP 404/410 (dead endpoint) or the user logs out on a device.
CREATE TABLE push_subscriptions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    endpoint      text NOT NULL,     -- push-service URL (unique per subscription)
    p256dh        text NOT NULL,     -- client public key (base64url)
    auth          text NOT NULL,     -- auth secret (base64url)

    user_agent    text,              -- "manage devices" display / debugging
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now(),  -- prune stale rows

    -- re-registering the same device upserts instead of duplicating
    CONSTRAINT push_endpoint_unique UNIQUE (user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push_subscriptions - all" ON push_subscriptions FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============================================================
--  END v0.4.2
-- ============================================================
