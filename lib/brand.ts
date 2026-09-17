/**
 * THE ONE PLACE THE PRODUCT NAME AND THE HEADLINE PRICES ARE WRITTEN DOWN
 * (Spec 3-02 §Implementation 1).
 *
 * The rename is coming and has not been chosen yet. Every visible instance of
 * the name on the public landing page resolves from here, so renaming the
 * product is an edit to ONE line rather than a sweep across a page that a
 * reviewer, a crawler and an Apple enrolment case are all looking at.
 *
 * ⚠️ SCOPE, because the check in the spec reads wider than what was built.
 * Adrian's call (2026-09-16): this covers the LANDING PAGE and the site
 * metadata. The ~270 other "Trackd" strings across the app and the legal
 * chrome stay where they are until the trademark clearance search comes back
 * and the rename spec runs. A blanket find-and-replace before that answer is
 * exactly what he asked not to happen.
 *
 * ⚠️ THE PRICES HERE ARE FOR DISPLAY ON THE PUBLIC PAGE ONLY, AND NOTHING
 * CHARGES FROM THEM. `lib/billing/prices.ts` reads the real amounts from
 * Stripe and the paywall, the plan list and checkout all keep doing that, so
 * a dashboard price change still takes effect there without a deploy. Spec
 * w2b-15's rule ("no dollar amount hardcoded") holds everywhere money is
 * taken; this page is a marketing surface that must render statically, with
 * no Stripe round-trip in front of a visitor who has not signed up.
 *
 * So these two can drift, and the cost of drift is a wrong number on a
 * marketing page. If you change a price in Stripe, change it here in the same
 * sitting. `brand.test.ts` pins the weekly anchor to the yearly amount so at
 * least the two figures on the page cannot disagree with each other.
 */

/** The product name, as it appears to a visitor. Lowercase in the wordmark. */
export const PRODUCT_NAME = "Trackd";

/**
 * The BUSINESS name, for formal surfaces that are not the legal entity: the
 * openGraph `siteName` a link unfurler prints, and anywhere the product is
 * being named rather than addressed.
 *
 * ⚠️ "Trackd.co" is retired and must never appear (Adrian, 2026-09-04). It is
 * wrong twice over: it is not the registered entity, and the dot reads as a
 * domain the company does not own. The real domain is trackdco.app.
 *
 * It lives here for the same reason the product name does. `siteName` was
 * typed straight into the landing page's metadata, which is a VISIBLE instance
 * of the name that a rename would have missed, and missing one is exactly what
 * this file exists to prevent.
 */
export const BUSINESS_NAME = "Trackd Co";

/** The registered entity. Must match ASIC and the Stripe descriptor exactly. */
export const LEGAL_ENTITY = "Trackd Co Pty Ltd";

/** Australian Company Number, in ASIC's own spacing. */
export const ACN = "698 405 462";

/** Where a visitor writes to. Also the address in the legal documents. */
export const SUPPORT_EMAIL = "support@trackdco.app";

export interface BrandPlan {
  /** Charged amount in whole currency units, for display. */
  readonly amount: number;
  /** What one charge buys. */
  readonly period: "year" | "month" | "week";
}

/**
 * The three plans, as they are configured in Stripe today (2026-09-16, USD).
 * Verified against the live price objects, not copied from a screenshot.
 */
export const PLANS = {
  yearly: { amount: 69.99, period: "year" },
  monthly: { amount: 11.99, period: "month" },
  weekly: { amount: 3.99, period: "week" },
} as const satisfies Record<string, BrandPlan>;

/** ISO 4217, for the line that says which dollars these are. */
export const CURRENCY = "USD";

/** Weeks in a year, for the anchor. Matches `lib/onboarding/pricing.ts`. */
const WEEKS_PER_YEAR = 52;

/**
 * The anchor figure: what the yearly plan works out to per week.
 *
 * DERIVED rather than written down, so it cannot disagree with the yearly
 * amount above the way two typed numbers eventually do. $69.99 / 52 = $1.3459,
 * which rounds to the $1.35 the spec's checklist names.
 */
export const YEARLY_PER_WEEK = Math.round((PLANS.yearly.amount / WEEKS_PER_YEAR) * 100) / 100;

/**
 * Trackd Co's own social accounts (Adrian, 2026-09-17). The footer links to
 * both. Kept here rather than in the footer because a handle change is the same
 * kind of edit as a name change: one line, found in one place.
 */
export const SOCIAL_LINKS = {
  tiktok: "https://www.tiktok.com/@trackdcoapp",
  instagram: "https://www.instagram.com/trackdcoapp/",
} as const;
