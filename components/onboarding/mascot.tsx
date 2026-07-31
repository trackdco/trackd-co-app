"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Kyle the vial (Spec 3-01 §3.3) — the mascot, at the two celebration beats.
 *
 * **Kyle is a VIAL, never a jar.** The reference images for this build showed a
 * jar with arms; that is not him, and any art dropped in here has to be the
 * vial.
 *
 * ART IS NOT WIRED YET. Until a file exists at the path below, this renders a
 * DESIGNED placeholder rather than a broken image: a surface panel carrying the
 * pose name, so a preview reads as "art goes here" instead of "this is broken".
 * Dropping the real files in is the only change needed:
 *
 *     public/onboarding/kyle-flex.png     (celebrate)
 *     public/onboarding/kyle-happy.png    (welcome)
 *
 * then flip the pose's entry in `KYLE_ART` from null to its path.
 */

export type KylePose = "flex" | "happy";

/** Fill these in when the art lands. null renders the placeholder. */
const KYLE_ART: Record<KylePose, string | null> = {
  flex: null,
  happy: null,
};

const POSE_LABEL: Record<KylePose, string> = {
  flex: "Kyle the vial · flex",
  happy: "Kyle the vial · happy",
};

export function Mascot({
  pose,
  size = 180,
  className,
}: {
  pose: KylePose;
  size?: number;
  className?: string;
}) {
  const src = KYLE_ART[pose];

  if (src) {
    return (
      <Image
        src={src}
        alt={POSE_LABEL[pose]}
        width={size}
        height={size}
        priority
        className={cn("h-auto w-auto object-contain", className)}
        style={{ maxHeight: size }}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl bg-bg-surface",
        className,
      )}
      style={{ height: size, width: size * 0.78 }}
      role="img"
      aria-label={POSE_LABEL[pose]}
    >
      {/* A vial outline, so the placeholder is at least the right silhouette
          and nobody mistakes the slot for a jar. */}
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
        {pose === "flex" ? "Kyle · flex" : "Kyle · happy"}
      </p>
    </div>
  );
}
