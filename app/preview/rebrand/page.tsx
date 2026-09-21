import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RebrandNotice } from "@/components/rebrand/RebrandNotice";

export const metadata: Metadata = {
  title: "Rebrand notice preview · Trakabl",
  robots: { index: false, follow: false },
};

/**
 * DEV-ONLY preview of the rebrand notice, viewable WITHOUT signing in.
 *
 * ## Why the real screen cannot be looked at
 *
 * On the dashboard this renders ONCE, for accounts created before the rename
 * shipped, only when no billing notice outranks it, and it writes a cookie the
 * moment it is dismissed. So every real sighting is somebody's only sighting,
 * and checking that a headline wraps would cost a user theirs.
 *
 * Here it mounts unconditionally and re-mounts on reload, so the wordmark swap
 * can be watched as many times as it takes.
 *
 * ## ⚠️ IT IS THE REAL COMPONENT, NOT A COPY
 *
 * Same import the dashboard uses. What you see here is what ships, including
 * the animation timing and the fine print — so a copy change lands in both
 * places or neither.
 *
 * ⚠️ DISMISSING IT HERE WRITES THE REAL COOKIE for the fake id below. That is
 * deliberate: it makes the dismissal path checkable. The id is not a real
 * account, so no user's notice is consumed. Clear
 * `trakabl_rebrand_notice_seen` if you want to re-drive the button.
 *
 * Gated on `VERCEL_ENV` rather than `NODE_ENV`, matching `preview/grace-notice`
 * and `preview/paywall`: a Vercel preview deploy IS a production build, so a
 * `NODE_ENV` gate would 404 the exact link this exists to be reviewed through.
 */
export default function RebrandNoticePreviewPage() {
  if (
    !(
      process.env.VERCEL_ENV === "preview" ||
      process.env.NODE_ENV === "development"
    )
  ) {
    notFound(); // hide on ALL production hosts (incl. non-Vercel), keep Vercel preview + local dev
  }

  return (
    <main className="min-h-dvh bg-bg-base">
      <p className="mx-auto max-w-md px-5 pt-6 text-[11px] uppercase tracking-[0.18em] text-text-subtle">
        Rebrand notice · reload to replay
      </p>
      <RebrandNotice userId="preview-not-a-real-account" />
    </main>
  );
}
