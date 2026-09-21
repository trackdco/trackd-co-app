import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NotificationMock } from "@/components/onboarding/notification-mock";
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notification prompts · Trakabl",
};

/**
 * DEV-ONLY: the three permission-prompt drawings side by side.
 *
 * `NotificationMock` picks its art from the guessed platform, and the
 * onboarding screen that mounts it is behind the auth gate, so the only way to
 * see all three at once is to render them directly. That matters more than it
 * sounds: the whole argument for drawing three (see the component's header) is
 * RECOGNITION, and the only way to check a drawing is recognisable is to look
 * at it beside the ones it has to be distinguishable from.
 *
 * The desktop one was added 2026-09-10, when `Platform` gained `"desktop"`.
 * Before that a laptop fell through to the Android sheet.
 *
 * 404s in production.
 */
export default function NotifyPromptsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const variants = [
    { platform: "desktop" as const, label: "Desktop", note: "Chrome and Edge: a panel under the address bar, naming the origin." },
    { platform: "ios" as const, label: "iOS", note: "Apple's own wording, centred, with a divided two-button footer." },
    { platform: "android" as const, label: "Android", note: "A squarer sheet with the actions ranged right and no dividers." },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14">
      <p className={CARD_EYEBROW}>Preview · onboarding</p>
      <h1 className={cn(PAGE_TITLE, "mt-3")}>Notification prompts</h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-text-muted">
        One per platform, because the point is that somebody recognises the
        dialog they are about to be shown. Inert here: no{" "}
        <span className="font-mono text-xs">onActivate</span> is passed, so
        nothing requests permission.
      </p>

      <div className="mt-12 grid gap-12 md:grid-cols-3">
        {variants.map((v) => (
          <section key={v.platform}>
            <h2 className={CARD_EYEBROW}>{v.label}</h2>
            <p className="mt-2 mb-7 text-xs leading-relaxed text-text-subtle">
              {v.note}
            </p>
            <NotificationMock platform={v.platform} />
          </section>
        ))}
      </div>
    </main>
  );
}
