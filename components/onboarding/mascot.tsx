"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Kyle, at the two celebration beats (Spec 3-01 §3.3).
 *
 * ## Dropping the art in
 *
 * Save the two renders to `public/onboarding/` and the slots fill themselves:
 *
 *     kyle-thumbs.png   thumbs up, smiling   -> the celebrate screen
 *     kyle-flex.png     flexing              -> welcome, once the trial starts
 *
 * Until a file is there, a designed placeholder renders instead of a broken
 * image, so a preview reads as "art goes here" rather than "this is broken".
 *
 * ## Why the background is NOT cut out
 *
 * The renders come on a near-black backdrop and Kyle wears a black singlet, a
 * few points of luminance apart. Any automatic matte takes the singlet with the
 * background and punches holes through his shirt. So instead of cutting him
 * out, the image edge is FEATHERED with a radial mask: the backdrop dissolves
 * into our canvas (which is also near-black) and the shirt is never touched.
 * Costs nothing, cannot go wrong, and needs no export from anyone.
 *
 * If a true transparent PNG ever arrives, the mask is harmless on it too.
 */

export type KylePose = "thumbs" | "flex";

const KYLE_ART: Record<KylePose, string> = {
  thumbs: "/onboarding/kyle-thumbs.png",
  flex: "/onboarding/kyle-flex.png",
};

/** Both renders landed 2026-08-01 (Adrian). Downscaled from the ~8MB originals
 *  in `public/`, which are far too heavy to put on a page. */
const ART_PRESENT: Record<KylePose, boolean> = {
  thumbs: true,
  flex: true,
};

const POSE_LABEL: Record<KylePose, string> = {
  thumbs: "Kyle, thumbs up",
  flex: "Kyle, flexing",
};

/** Feathers the square render into the canvas so no cut-out is needed. */
const FEATHER =
  "[mask-image:radial-gradient(circle_at_50%_46%,black_54%,transparent_78%)] [-webkit-mask-image:radial-gradient(circle_at_50%_46%,black_54%,transparent_78%)]";

/**
 * A soft amber bloom behind him, fading in once (Adrian, 2026-08-05: "add a
 * small amber bloom that fades in, and do that on the other Kyle stuff as
 * well").
 *
 * It belongs to KYLE rather than to a screen, which is why it lives here and
 * not in three call sites: he appears on celebrate, welcome and the greeting,
 * and a light that only reached one of them would read as that screen being
 * special rather than as him being lit.
 *
 * One-shot and behind him, so it is depth rather than ambient motion —
 * `ui-context.md` bans the latter. It is also the reason the mascot is wrapped
 * in a positioned span now: the bloom needs something to be absolute against.
 */
function Bloom({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="animate-welcome-bloom pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
      style={{
        width: size * 0.95,
        height: size * 0.95,
        background:
          "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 26%, transparent), transparent 70%)",
      }}
    />
  );
}

export function Mascot({
  pose,
  size = 200,
  className,
  bloom = true,
}: {
  pose: KylePose;
  size?: number;
  className?: string;
  /** Set false where a screen supplies its own light (the effect harness). */
  bloom?: boolean;
}) {
  if (ART_PRESENT[pose]) {
    return (
      <span className="relative inline-flex items-center justify-center">
        {bloom ? <Bloom size={size} /> : null}
        <Image
        src={KYLE_ART[pose]}
        alt={POSE_LABEL[pose]}
        width={720}
        height={900}
        priority
        sizes="(max-width: 480px) 60vw, 260px"
          className={cn(
            "animate-kyle relative h-auto w-auto object-contain",
            FEATHER,
            className,
          )}
          style={{ maxHeight: size }}
        />
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flow-card flex flex-col items-center justify-center gap-3 rounded-2xl bg-bg-surface",
        className,
      )}
      style={{ height: size, width: size * 0.78 }}
      role="img"
      aria-label={POSE_LABEL[pose]}
    >
      <svg
        viewBox="0 0 60 96"
        width={size * 0.34}
        height={size * 0.54}
        aria-hidden
        className="text-text-subtle"
      >
        <rect x="19" y="2" width="22" height="13" rx="2.5" fill="currentColor" opacity="0.35" />
        <rect x="21.5" y="13" width="17" height="5" rx="1" fill="currentColor" opacity="0.5" />
        <rect
          x="14"
          y="17"
          width="32"
          height="72"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
      <p className="text-[9px] font-sans uppercase tracking-[0.18em] text-text-subtle">
        Kyle · {pose}
      </p>
    </div>
  );
}
