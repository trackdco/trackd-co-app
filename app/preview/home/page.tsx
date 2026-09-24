import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { QuickActionsFab } from "@/components/shortcuts/QuickActionsFab";
import { PreviewHome } from "./PreviewHome";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { StackCompound } from "@/lib/home/stack";
import type { Stack } from "@/lib/home/stacks";
import type { DayLogs } from "@/lib/home/doseLog";
import { IM_SITES, SUBQ_SITES } from "@/lib/home/siteCatalog";
import type { InjectionSiteRow } from "@/lib/db/types";

/** The static site list standing in for the catalogue read (as /preview/sites). */
function previewCatalogue(): InjectionSiteRow[] {
  const rows = (defs: { id: string; label: string }[], route: "im" | "subq") =>
    defs.map((d, i) => ({
      id: d.id,
      label: d.label,
      route,
      side: d.id.endsWith("-l") ? "left" : d.id.endsWith("-r") ? "right" : "n_a",
      aspect: "anterior",
      x: 0,
      y: 0,
      sort_order: i,
    })) as InjectionSiteRow[];
  return [...rows(IM_SITES, "im"), ...rows(SUBQ_SITES, "subq")];
}

/** A day `n` days before today, as a key. */
function daysAgo(n: number): string {
  const d = new Date();
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
}

/**
 * DEV-ONLY preview of the Home / Dashboard screen, viewable without signing in
 * or any Supabase env. Mirrors the (app) shell (wordmark header + fixed bottom
 * nav) so the sticky week strip behaves exactly as it does in the real app.
 * Returns 404 in production so it never ships.
 */
export default async function PreviewHomePage({
  searchParams,
}: {
  searchParams: Promise<{ loading?: string; live?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  // `?loading=1500` holds the loading skeleton that long, then lands the log,
  // so the feel pass's skeleton and crossfade can be reviewed (wave 3 §1).
  const { loading, live } = await searchParams;
  const loadingMs = loading ? Number(loading) : null;

  const todayKey = toDateKey(new Date());

  // Compounds for the day's log. Three of them are grouped into a STACK (Spec 05)
  // and one runs on a CYCLE (Spec 06), so both are reviewable here.
  const daily = (id: string, name: string, category: StackCompound["category"],
                 method: StackCompound["method"], dose: number, unit: string,
                 time: string): StackCompound => ({
    id, name, category, method, dose, unit,
    schedule: { cadence: { type: "daily" }, timeOfDay: time, startDate: "2026-01-01" },
    rotationSites: [], rotationIndex: 0,
  });

  const sampleCompounds: StackCompound[] = [
    daily("c-test", "Testosterone E", "anabolic", "im", 250, "mg", "08:00"),
    daily("c-bpc", "BPC-157", "peptide", "subq", 250, "mcg", "08:00"),
    daily("c-tb", "TB-500", "peptide", "subq", 2, "mg", "08:00"),
    daily("c-anas", "Anastrozole", "ancillary", "po", 0.5, "mg", "20:00"),
    // Half-life build: a twice-weekly injection, so the glance has a long curve.
    {
      ...daily("c-reta", "Retatrutide", "peptide", "subq", 2, "mg", "08:00"),
      schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "08:00", startDate: "2026-01-01" },
    },
    // On a 7-on / 7-off cycle — off-cycle days vanish from the log entirely.
    {
      ...daily("c-mk", "MK-677", "sarm", "po", 12.5, "mg", "22:00"),
      cycle: {
        pattern: { type: "onOff", onDays: 7, offDays: 7 },
        end: { type: "never" },
        colour: "moss",
        anchor: toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 2)),
      },
    },
    // Twice a day (Spec w2b-13, Step 5): one parent row reading "n of 2", with
    // two independently tickable sub-rows. `laterTimes` holds slots 1..n; slot
    // 0's time stays in `timeOfDay`, so a once-daily compound is unchanged.
    {
      ...daily("c-metf", "Metformin", "oral", "po", 500, "mg", "08:00"),
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        // PER-SLOT AMOUNT: 500 mg in the morning, 250 mg at night. Adrian's
        // addition over the spec (`supabase/protocol/021`) — the sub-rows
        // should read 500mg and 250mg, not 500mg twice.
        laterDoses: [250],
        startDate: "2026-01-01",
      },
    },
  ];

  // PAUSED for a fortnight (Spec w2b-13, Step 6). It should appear as one dim
  // row reading "Paused · back <date>", never hidden — a hidden compound reads
  // as a deleted one — and none of its days should count as missed.
  sampleCompounds.push({
    ...daily("c-nac", "NAC", "supplement", "po", 600, "mg", "21:00"),
    pauses: [
      {
        id: "pause-nac",
        startedOn: toDateKey(
          new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 3),
        ),
        endsOn: toDateKey(
          new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 10),
        ),
      },
    ],
  });

  // A paused STACK MEMBER. It must stay inside "Morning shot", blacked out and
  // struck through — NOT moved to the Paused section — so the stack keeps
  // showing every compound it contains (Adrian, 2026-08-07).
  const tb = sampleCompounds.find((c) => c.id === "c-tb");
  if (tb) {
    tb.pauses = [
      {
        id: "pause-tb",
        startedOn: toDateKey(
          new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1),
        ),
        endsOn: toDateKey(
          new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 6),
        ),
      },
    ];
  }

  // One stack: the three things taken together at 8am.
  const sampleStacks: Stack[] = [
    {
      id: "s-morning",
      name: "Morning shot",
      colour: "steel",
      // Dated well back so the preview's stack row renders on the day shown —
      // grouping applies from its own start forward, never before it.
      effectiveFrom: "2026-01-01",
      members: ["c-test", "c-bpc", "c-tb"].map((compoundId, position) => ({
        compoundId,
        from: "2026-01-01",
        position,
      })),
    },
  ];

  // One member already logged, so the stack row shows PARTIAL state (1 of 3).
  // A few past Sub-Q and IM doses WITH sites, so the log sheet's map has a
  // history to shade and day counts to show (feel pass §5).
  const site = (siteId: string, amount: string, unit: string) => ({
    amount,
    unit,
    siteId,
    time24: "08:00",
  });
  // Three weeks of history behind the sample days below, so the half-life
  // glance has curves to draw (the days below overwrite these where they meet).
  const history: DayLogs = {}
  for (let n = 21; n >= 1; n--) {
    const key = daysAgo(n)
    const dow = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - n).getDay()
    history[key] = {
      "c-bpc": site("sq-abdo-l", "250", "mcg"),
      "c-anas": { amount: "0.5", unit: "mg", siteId: null, time24: "20:00" },
      ...(dow === 1 || dow === 4 ? { "c-reta": site("sq-abdo-r", "2", "mg") } : {}),
    }
  }
  const sampleLogs: DayLogs = {
    [daysAgo(1)]: { "c-bpc": site("sq-abdo-l", "250", "mcg"), "c-test": site("im-delt-l", "250", "mg") },
    [daysAgo(2)]: { "c-bpc": site("sq-glute-l", "250", "mcg"), "c-tb": site("sq-abdo-r", "2", "mg") },
    [daysAgo(3)]: { "c-bpc": site("sq-thigh-up-l", "250", "mcg"), "c-test": site("im-quad-front-r", "250", "mg") },
    [daysAgo(5)]: { "c-bpc": site("sq-abdo-ll", "250", "mcg"), "c-test": site("im-vglute-l", "250", "mg") },
    [todayKey]: {
      "c-bpc": { amount: "250", unit: "mcg", siteId: null, time24: "08:05" },
      // Metformin's MORNING dose only — slot 0, whose key is the bare compound
      // id. The row should read "1 of 2" with the evening dose still untaken,
      // and the day's ring should NOT read complete.
      "c-metf": { amount: "500", unit: "mg", siteId: null, time24: "08:10" },
      // SKIPPED (Spec w2b-13, Step 7): a minus rather than a tick, and the row
      // reads "Skipped" instead of an amount. Resolved, but not taken.
      "c-anas": {
        amount: "0.5",
        unit: "mg",
        siteId: null,
        time24: "20:00",
        status: "skipped",
      },
    },
  };



  for (const [key, day] of Object.entries(history)) {
    sampleLogs[key] = { ...day, ...(sampleLogs[key] ?? {}) }
  }

  return (
    <div className="flow-canvas-fixed flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image
          src="/trackd-wordmark.png"
          alt="Trakabl"
          width={1044}
          height={200}
          className="h-4 w-auto"
        />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Home
        </span>
      </header>

      <main className="flex-1">
        <PreviewHome
          loadingMs={loadingMs}
          live={live === "1"}
          previewStack={sampleCompounds}
          previewStacks={sampleStacks}
          previewLogs={sampleLogs}
          todayKey={todayKey}
          userId="preview-local"
          firstName="Adrian"
          injectionCatalogue={previewCatalogue()}
        bodySex="male"
        />
      </main>

      <BottomNav />
      <QuickActionsFab userId="preview-local" unit="kg" bodySex="male" lastWeightKg={84.6} />
    </div>
  );
}
