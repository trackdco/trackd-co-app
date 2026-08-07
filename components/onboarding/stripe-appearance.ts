import type { Appearance } from "@stripe/stripe-js";

/**
 * The Payment Element's theme, built from the LIVE design tokens.
 *
 * ## Why this reads the document instead of listing colours
 *
 * The Element renders in a cross-origin iframe, so it cannot see our CSS custom
 * properties — Stripe's `appearance` needs literal values. Typing those literals
 * here would put hex into a component, which `code-standards.md` forbids
 * everywhere outside `globals.css`, and would leave a second copy of the palette
 * to drift the first time anyone retunes it.
 *
 * So the values are read off `:root` at mount with `getComputedStyle`.
 * `globals.css` stays the single source of truth and a palette change carries
 * into Stripe with no second edit.
 *
 * ## The fallbacks ARE hex, and that is a documented exception
 *
 * An earlier version of this comment claimed "no hex enters this file", which a
 * cold review correctly called out as false: the seven literals below are hex,
 * and `code-standards.md` forbids hex outside `globals.css`.
 *
 * They are kept because `getComputedStyle` needs a document and this module is
 * imported into one that server-renders. They are also NEVER what a browser
 * uses — the same review read the live iframe's computed styles and found the
 * real tokens (`rgb(42,42,40)` = `--bg-input`, `rgb(240,239,233)` =
 * `--text-primary`, `Geist`), so the fallback path does not render for a user.
 * Treat them as a last-resort default, keep them in step with `globals.css`, and
 * do not copy the pattern anywhere a component actually paints.
 *
 * ## The one token that is deliberately NOT used
 *
 * `--accent-primary` is `#ffffff`, so it cannot be Stripe's `colorPrimary`: a
 * white focus ring on a near-white field is invisible, which is precisely the
 * mistake `ui-context.md` records for the switch control. Amber is the right
 * pick and is already `--ring`.
 */

/** Read a custom property off `:root`, or fall back if it is missing. */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Fallbacks exist only for the server render and for a browser that somehow has
 * no stylesheet. They are intentionally NEUTRAL rather than copies of the
 * palette — if this ever renders, something is wrong, and a legible grey box is
 * a better failure than a near-match nobody notices is stale.
 */
export function paymentAppearance(): Appearance {
  const surface = token("--bg-input", "#2a2a28");
  const text = token("--text-primary", "#f0efe9");
  const muted = token("--text-muted", "#7a7a74");
  const subtle = token("--text-subtle", "#4a4a46");
  const amber = token("--accent-amber", "#c8861a");
  const border = token("--border-default", "#2e2e2c");
  const danger = token("--state-error", "#ef4444");

  return {
    // The dark base. Every colour below overrides it, but starting from `night`
    // means anything Stripe adds later inherits a dark default rather than
    // appearing as a white panel in a near-black flow.
    theme: "night",
    variables: {
      colorPrimary: amber,
      colorBackground: surface,
      colorText: text,
      colorTextSecondary: muted,
      colorTextPlaceholder: subtle,
      colorDanger: danger,
      // `ui-context.md` → Typography: two faces, and this is the UI one. The
      // family name is what `next/font` exposes on the CSS variable; the
      // `fonts` array on <Elements> is what actually gets it into the iframe.
      fontFamily: token("--font-geist-sans", "system-ui, sans-serif"),
      // Inputs are `rounded-xl` throughout the app (see `lib/ui-presets.ts`),
      // which is 12px. Cards are `rounded-2xl`; the Element only draws inputs.
      borderRadius: "12px",
      // The 4px step the whole spacing scale is built on (`px-5` = 20, `gap-3`
      // = 12, `py-3.5` = 14). Stripe multiplies this internally, so handing it
      // the base unit keeps the Element on the same rhythm as the rows above it.
      spacingUnit: "4px",
    },
    rules: {
      // BORDERLESS SURFACES, hairlines only where structure is needed — the
      // house rule is that a card separates by surface alone and a border is
      // reserved for something genuinely interactive. An input IS that, so it
      // keeps a hairline, and it takes the amber ring on focus like every other
      // focusable thing in the app.
      ".Input": {
        border: `0.5px solid ${border}`,
        boxShadow: "none",
      },
      ".Input:focus": {
        border: `0.5px solid ${amber}`,
        boxShadow: `0 0 0 1px ${amber}`,
      },
      ".Label": {
        // Not the tracked-uppercase CARD_EYEBROW: these are form labels inside a
        // third-party control, and imposing our eyebrow treatment on "Card
        // number" would read as a section heading rather than a field label.
        color: muted,
        fontSize: "0.8rem",
      },
      ".Tab, .Block": {
        backgroundColor: surface,
        border: `0.5px solid ${border}`,
      },
      ".Tab--selected": {
        border: `0.5px solid ${amber}`,
        color: text,
      },
    },
  };
}
