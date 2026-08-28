import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * DEV-ONLY index for the install-screen previews. 404s in production so it
 * never ships, matching the other `/preview/*` routes.
 *
 * Each child route renders ONE screen full-bleed at device size, so it can be
 * opened on a real handset and judged at the size it will ship at. A scaled
 * mock in a design tool cannot tell you whether 11pt labels are legible.
 */
const SCREENS = [
  {
    href: "/preview/install/presell",
    title: "This is where Trackd goes",
    note: "The pre-sell. One action, no skip. Switch iPhone / Samsung / Pixel at the top. Each draws its own launcher.",
  },
  {
    href: "/preview/install/stop",
    title: "Open Safari",
    note: "The black stop screen, for iPhone users in Chrome, Firefox or Edge, where adding to the Home Screen is impossible.",
  },
  {
    href: "/preview/install/returned",
    title: "The tab you came back to",
    note: "Three states, by how sure we can be: Android verified, iPhone asked, and the obsolete tab.",
  },
];

export default function InstallPreviewIndex() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-14">
      <p className="text-xs tracking-[0.18em] text-text-muted uppercase">Dev preview</p>
      <h1 className="mt-2 text-[2rem] leading-[1.1] font-light tracking-[-0.02em] text-foreground">
        Install screens
      </h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-text-muted">
        Open these on your phone at <span className="text-foreground">localhost:3000</span> to see
        them at real size.
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        {SCREENS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-2xl border border-border-default bg-bg-surface px-5 py-4 transition-colors hover:border-border-strong"
            >
              <span className="block text-[0.98rem] text-foreground">{s.title}</span>
              <span className="mt-1 block text-[0.85rem] leading-relaxed text-text-muted">
                {s.note}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
