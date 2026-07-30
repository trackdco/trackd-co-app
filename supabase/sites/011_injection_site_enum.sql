-- ============================================================================
-- 011 — make `injection_site` able to hold every site the app offers
-- ============================================================================
-- The body map offers 36 sites (`injection_sites` catalogue). `dose_logs
-- .injection_site` is a 13-value enum, so 22 of them had no member: they were
-- stored as `other` and read back as NULL. Logging into "Trap - Left" erased the
-- site within seconds; "Front Quad - Left" came back as "Outer Quad - Left", a
-- different muscle, silently.
--
-- The granular id has always been preserved in the device store, so the app's own
-- recency view was right. But localStorage is a cache: on a reinstall, a new
-- device, or after clearing site data, Postgres is the only copy — and it could not
-- represent what the user had chosen. This closes that.
--
-- 26 new values, one per distinct muscle+side the catalogue can produce. Sides that
-- genuinely share a muscle keep sharing a value: `im-glute-*` and `sq-glute-*` are
-- the same anatomy differing only by route, and route is already known from the
-- compound, so `injectionSiteToLocal(site, method)` resolves them without ambiguity.
--
-- ADDITIVE ONLY. Every existing value stays, so no stored row changes meaning and
-- no backfill is needed. Rows already flattened to `other` cannot be recovered from
-- Postgres alone (the information was destroyed at write time) but their device
-- copies still hold the real site, and hydration now prefers it.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that then
-- uses the new value. Run this file on its own, before deploying the app change.
-- Idempotent via IF NOT EXISTS.
-- ============================================================================

-- Quad: the catalogue distinguishes the OUTER and FRONT quad, which both collapsed
-- into `quad_*`. Outer keeps the existing value; front gets its own.
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'quad_front_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'quad_front_right';

-- Upper body IM sites that had no member at all.
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'bicep_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'bicep_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'tricep_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'tricep_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'lat_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'lat_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'pec_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'pec_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'trap_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'trap_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'calf_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'calf_right';

-- Sub-Q: the abdomen had a LOWER and a SIDE site collapsing into `abdomen_*`.
-- Side keeps the existing value; lower gets its own.
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'abdomen_lower_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'abdomen_lower_right';

-- Sub-Q thigh and arm, which had no member at all.
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'thigh_upper_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'thigh_upper_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'thigh_lower_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'thigh_lower_right';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'arm_left';
ALTER TYPE injection_site ADD VALUE IF NOT EXISTS 'arm_right';
