/**
 * THE ONE PLACE THE PRODUCT NAME AND THE HEADLINE PRICES ARE WRITTEN DOWN
 * (Spec 3-02 §Implementation 1).
 *
 * The rename HAS NOW HAPPENED (Adrian, 2026-09-21): the product is Trakabl.
 * Every visible instance of the name on the public landing page resolves from
 * here, so the next rename — or a correction to this one — is an edit to ONE
 * line rather than a sweep across a page that a reviewer, a crawler and an
 * Apple enrolment case are all looking at.
 *
 * ⚠️ THE SPELLING IS "Trakabl". No "c", no trailing "e".
 *
 * It is NOT "Trackable", which is the ordinary English word and is what
 * dictation produces when Adrian says the name out loud — his own first
 * message carried both spellings and he confirmed the short one. It is not
 * "Trakabel" or "Trakable" either. There is no phonetic route to the correct
 * spelling, so anything writing this name should import it from here rather
 * than typing it, and a reviewer who sees it typed inline should treat that as
 * a defect. The precedent is on file: "Trackd.co" was wrong, was typed inline
 * in several places, and shipped.
 *
 * ⚠️ SCOPE HAS WIDENED. This file used to cover the LANDING PAGE ONLY, because
 * the name had not been chosen and a blanket find-and-replace before the
 * trademark answer was exactly what Adrian asked not to happen. That answer is
 * in and the rename spec is running, so the app and the legal chrome are being
 * swept too. New code should import from here; the existing inline strings are
 * being converted where they are plain copy and deliberately left alone where
 * they are pinned legal text (see `lib/billing/signed/`).
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
export const PRODUCT_NAME = "Trakabl";

/**
 * The BUSINESS name, for formal surfaces that are not the legal entity: the
 * openGraph `siteName` a link unfurler prints, and anywhere the product is
 * being named rather than addressed.
 *
 * ⚠️ IT IS NOW THE SAME WORD AS `PRODUCT_NAME`, AND THAT IS NOT A MISTAKE.
 * It was "Trackd Co" — product plus a suffix — and the rename collapses the
 * two: Trakabl is a registered business name trading under the unchanged legal
 * entity below (Adrian, 2026-09-21: "The company is not being renamed. We are
 * making a business name that it will be trading under"). Both constants stay
 * because their CALL SITES mean different things, and the next brand decision
 * may separate them again. Do not delete one and alias the other.
 *
 * ⚠️ "Trackd.co" is retired and must never appear (Adrian, 2026-09-04). It was
 * wrong twice over: not the registered entity, and the dot read as a domain the
 * company does not own. "Trackd Co" is now retired too, as a VISIBLE name — it
 * survives only inside `LEGAL_ENTITY`.
 */
export const BUSINESS_NAME = "Trakabl";

/**
 * The registered entity. Must match ASIC and the Stripe descriptor exactly.
 *
 * ⚠️ THIS DOES NOT CHANGE WITH THE RENAME. Trakabl is a business name; the
 * company behind it is still Trackd Co Pty Ltd, and the legal documents, the
 * card statement and the ASIC record all still say so. Anywhere the entity is
 * being named — a contract, a merchant-of-record line, a footer disclosure —
 * uses this and not `BUSINESS_NAME`. Sweeping "Trackd" out of this string would
 * make the legal documents name a company that does not exist.
 */
export const LEGAL_ENTITY = "Trackd Co Pty Ltd";

/** Australian Company Number, in ASIC's own spacing. */
export const ACN = "698 405 462";

/**
 * How the product and the company relate, for the surfaces that have to say it
 * out loud: the rebrand notice, the landing footer and the legal preamble.
 *
 * Written once here because it is a CLAIM ABOUT A LEGAL RELATIONSHIP and three
 * surfaces making it in three slightly different ways is how a disclosure ends
 * up inaccurate in one of them.
 */
export const TRADING_AS = `${BUSINESS_NAME} is a business name of ${LEGAL_ENTITY} (ACN ${ACN})`;

/**
 * TWO ORIGINS, AND THE APP IS NOT MOVING OFF THE OLD ONE.
 *
 * trakabl.app is registered (Adrian, 2026-09-22). trackdco.app is NOT retired,
 * and the reason is not sentiment:
 *
 *   · An installed PWA is scoped to the ORIGIN IT WAS INSTALLED FROM. Point
 *     trackdco.app at the new domain and every existing home-screen install
 *     navigates out of scope — iOS drops it out of standalone into Safari, and
 *     the app someone installed stops behaving like an app.
 *   · Push subscriptions are issued against an origin and a service-worker
 *     registration. A new origin means every existing subscription is dead and
 *     every user has to grant notification permission again — on iOS, a
 *     permission most people grant exactly once.
 *   · Auth cookies are origin-scoped, so moving the app signs everyone out.
 *
 * So BOTH origins serve the whole app. The new one is canonical for search and
 * is where new visitors land; the old one keeps working indefinitely for the
 * people already on it. Only the MARKETING routes redirect across — see the
 * host-scoped rules in `next.config.ts`.
 */

/**
 * Where the app is SERVED and where existing installs live.
 *
 * ⚠️ NOT the canonical address, and not a thing to "update" to the new domain.
 * This is what `originFromHost` falls back to and what Stripe is handed as a
 * return origin, so it has to name an origin that actually serves the app to
 * the person in front of it. Both do; this is the conservative one.
 */
export const PRODUCTION_ORIGIN = "https://trackdco.app";

/** The bare legacy host, for copy that says the old address out loud. */
export const PRODUCTION_HOST = "trackdco.app";

/**
 * THE CANONICAL ORIGIN — what search engines should index and what a shared
 * link should say.
 *
 * Used for `alternates.canonical` and the openGraph URLs, and as the target of
 * the marketing-route redirects. Deliberately separate from
 * {@link PRODUCTION_ORIGIN}: one answers "where is this served", the other
 * "what is this called", and during a rename those are different questions.
 */
export const CANONICAL_ORIGIN = "https://trakabl.app";

/** The bare canonical host, for copy that says the new address out loud. */
export const CANONICAL_HOST = "trakabl.app";


/**
 * Where a visitor writes to. Also the address in the legal documents.
 *
 * Still on the old domain deliberately: mail has to keep arriving, and it will
 * until the new domain's MX records exist. Moves with `PRODUCTION_ORIGIN`.
 */
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
 * The company's own social accounts (Adrian, 2026-09-17). The footer links to
 * both. Kept here rather than in the footer because a handle change is the same
 * kind of edit as a name change: one line, found in one place.
 *
 * ⚠️ THE TWO PLATFORMS TOOK DIFFERENT HANDLES, and neither is a typo for the
 * other: Instagram is bare `trakabl`, TikTok is `Trakabl.app`. Do not
 * normalise one to match the other — both were verified to resolve when they
 * were set (Adrian, 2026-09-24, in the same sitting as the accounts).
 */
export const SOCIAL_LINKS = {
  tiktok: "https://www.tiktok.com/@Trakabl.app",
  instagram: "https://www.instagram.com/trakabl/",
} as const;
