import type { ReactNode } from "react";

import type { PoseShape } from "@/lib/progress/photos";

/**
 * Minimal stroke-figure silhouettes for the catalogue poses (Spec 09 addendum).
 * Stroke-based to match the icon language (Lucide); `currentColor` so they pick
 * up amber when a pose is selected. Abstract by design — a clean suggestion of
 * each stance, not anatomy.
 */
const FIGURES: Record<PoseShape, ReactNode> = {
  relaxed: (
    <>
      <circle cx="24" cy="11" r="5" />
      <path d="M24 16 V39" />
      <path d="M24 22 L15 38" />
      <path d="M24 22 L33 38" />
      <path d="M24 39 L18 55" />
      <path d="M24 39 L30 55" />
    </>
  ),
  side: (
    <>
      <circle cx="22" cy="11" r="5" />
      <path d="M22 16 L25 38" />
      <path d="M23 22 L31 31" />
      <path d="M25 38 L20 55" />
      <path d="M25 38 L29 54" />
    </>
  ),
  biceps: (
    <>
      <circle cx="24" cy="11" r="5" />
      <path d="M24 16 V37" />
      <path d="M24 22 L13 23 L17 13" />
      <path d="M24 22 L35 23 L31 13" />
      <path d="M24 37 L18 55" />
      <path d="M24 37 L30 55" />
    </>
  ),
  lat: (
    <>
      <circle cx="24" cy="11" r="5" />
      <path d="M24 16 V38" />
      <path d="M24 22 L12 29 L19 35" />
      <path d="M24 22 L36 29 L29 35" />
      <path d="M24 38 L17 55" />
      <path d="M24 38 L31 55" />
    </>
  ),
  abs: (
    <>
      <circle cx="24" cy="11" r="5" />
      <path d="M24 16 V38" />
      <path d="M24 22 L34 17 L28 10" />
      <path d="M24 22 L21 35" />
      <path d="M24 38 L16 53" />
      <path d="M24 38 L30 55" />
    </>
  ),
  crab: (
    <>
      <circle cx="24" cy="11" r="5" />
      <path d="M24 16 V33" />
      <path d="M24 22 L14 30 L23 37" />
      <path d="M24 22 L34 30 L25 37" />
      <path d="M24 33 L18 55" />
      <path d="M24 33 L30 55" />
    </>
  ),
};

export function PoseIcon({
  shape,
  className,
}: {
  shape: PoseShape;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {FIGURES[shape]}
    </svg>
  );
}
