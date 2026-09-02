import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { WeightView } from "@/components/weight/WeightView";
import { toDateKey } from "@/lib/home/mockHomeData";

/**
 * DEV-ONLY preview of `/weight`, viewable without signing in or any Supabase
 * env. 404s in production.
 *
 * It exists because the Trend / Scale graph was lifted out of `WeightView` into
 * the shared `WeightGraph` (so a block's weight sheet could draw the same one),
 * and there was no way to LOOK at this screen without an account. A refactor to
 * a graph you cannot see is a refactor you cannot check.
 *
 * `?state=sparse` gives a log with gaps in it, which is the case the trend's
 * trailing average and the date-based windowing both have to survive.
 */
export default async function PreviewWeightPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;

  const today = new Date();
  const dk = (daysAgo: number) =>
    toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo));

  // Eighteen months, so every range on the selector has something to draw and
  // "All" is genuinely wider than "1Y".
  const dense = Array.from({ length: 540 }, (_, i) => {
    const daysAgo = 539 - i;
    const noise = i % 3 === 0 ? 0.4 : i % 2 === 0 ? -0.3 : 0.1;
    return { key: dk(daysAgo), kg: Math.round((98 - i * 0.02 + noise) * 10) / 10 };
  });
  // Roughly weekly, with a two month hole in the middle.
  const sparse = dense.filter(
    (_, i) => i % 7 === 0 && !(i > 300 && i < 360),
  );

  const entries = state === "sparse" ? sparse : dense;

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          className="h-4 w-auto"
        />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Weight
        </span>
      </header>

      <main className="flex-1">
        <WeightView
          entries={entries}
          unitPreference="kg"
          todayKey={dk(0)}
        />
      </main>

      <BottomNav />
    </div>
  );
}
