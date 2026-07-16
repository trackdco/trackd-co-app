import { notFound } from "next/navigation";

import { SitesPreview } from "./sites-preview";

/**
 * DEV-ONLY preview of the male + female injection-site body maps side by side —
 * viewable without signing in or any Supabase env. 404 in production.
 *
 * The real `BodyMap` + the real artwork; only the catalogue read is swapped for
 * the static site list. Checks worth doing here: the female figure draws on both
 * routes (front AND back), the female IM map has no pecs, and tapping a
 * screen-left muscle reads "Left" on both bodies (mirror-front convention).
 */
export default function PreviewSitesPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6 py-10">
      <span className="self-start rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
        Preview · injection-site body maps
      </span>
      <h1 className="mt-4 font-display text-[2rem] leading-[1.1] font-medium tracking-[-0.02em] text-foreground">
        Male &amp; female bodies
      </h1>
      <p className="mt-3 max-w-prose text-[0.95rem] leading-relaxed text-text-muted">
        The same map the app draws, picked by your profile&apos;s sex. Switch
        route to check both, and use the Front/Back pill on each body. The female
        IM map has no pec sites — that&apos;s Angus&apos;s artwork, not a bug.
      </p>

      <div className="mt-8">
        <SitesPreview />
      </div>
    </div>
  );
}
