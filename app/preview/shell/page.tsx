import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesktopRail } from "@/components/desktop/DesktopRail";
import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";
import { DesktopKeyboard } from "@/components/desktop/DesktopKeyboard";
import { ReadOnlyProvider } from "@/components/billing/ReadOnlyGate";
import { HomeScreen } from "@/components/home/HomeScreen";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { DayLogs } from "@/lib/home/doseLog";
import type { StackCompound } from "@/lib/home/stack";
import { slotKey } from "@/lib/home/doseLog";

export const metadata: Metadata = {
  title: "Desktop shell · Trakabl",
};

/**
 * DEV-ONLY preview of the DESKTOP SHELL — sidebar, screen, rail — without a
 * signed-in session.
 *
 * The other `/preview/*` routes render a screen BARE, which is the right harness
 * for checking one screen's grid and useless for checking the thing around it.
 * The shell only exists inside `app/(app)/layout.tsx`, and that layout is behind
 * the auth guard, so without this page the only way to look at the sidebar and
 * the rail is to sign in.
 *
 * ## It reproduces the layout's structure, and that is a real cost
 *
 * This page hand-assembles the same three children the (app) layout assembles.
 * That is a second place the shell's shape is written down, and if the layout
 * gains a fourth column this page will quietly stop matching it. Accepted
 * deliberately, with the alternative weighed: extracting a shared `<DesktopShell>`
 * component would put a wrapper between the layout and `main` for the sake of a
 * dev harness, and the CSS grid depends on those three being DIRECT children of
 * the shell element. A preview that drifts is a smaller problem than a
 * production layout bent around a preview.
 *
 * Everything below is seeded data. Nothing here reads the database, and
 * `previewStack` suppresses the rail's stock fetch, so the page renders with no
 * session and no Supabase env at all. 404s in production.
 */
export default function PreviewShellPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const todayKey = toDateKey(new Date());

  const daily = (
    id: string,
    name: string,
    category: StackCompound["category"],
    method: StackCompound["method"],
    dose: number,
    unit: string,
    time: string,
  ): StackCompound => ({
    id,
    name,
    category,
    method,
    dose,
    unit,
    schedule: { cadence: { type: "daily" }, timeOfDay: time, startDate: "2026-01-01" },
    rotationSites: [],
    rotationIndex: 0,
  });

  const stack: StackCompound[] = [
    daily("c-test", "Testosterone E", "anabolic", "im", 250, "mg", "20:00"),
    daily("c-tren", "Trenbolone A", "anabolic", "im", 100, "mg", "06:30"),
    daily("c-bpc", "BPC-157", "peptide", "subq", 250, "mcg", "08:00"),
    daily("c-anas", "Anastrozole", "ancillary", "po", 0.5, "mg", "07:00"),
    daily("c-oxa", "Oxandrolone", "oral", "po", 40, "mg", "07:00"),
    daily("c-reta", "Retatrutide", "peptide", "subq", 4, "mg", "21:00"),
  ];

  /**
   * Three of the six logged, so the ring shows a real sweep rather than an
   * empty or a full circle, and "next due" resolves to the earliest thing
   * still outstanding.
   */
  const logs: DayLogs = {
    [todayKey]: {
      [slotKey("c-tren", 0)]: {
        amount: "100",
        unit: "mg",
        time24: "06:38",
        siteId: null,
      },
      [slotKey("c-anas", 0)]: {
        amount: "0.5",
        unit: "mg",
        time24: "07:12",
        siteId: null,
      },
      [slotKey("c-oxa", 0)]: {
        amount: "40",
        unit: "mg",
        time24: "07:12",
        siteId: null,
      },
    },
  };

  return (
    <ReadOnlyProvider canWrite>
      <div data-desktop-shell className="flex min-h-dvh flex-col">
        <DesktopSidebar userId="preview" previewStack={stack} />

        <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
          <HomeScreen
            userId="preview"
            todayKey={todayKey}
            firstName="Adrian"
            injectionCatalogue={[]}
            bodySex="male"
            previewStack={stack}
            previewLogs={logs}
          />
        </main>

        <DesktopRail
          userId="preview"
          unit="kg"
          bodySex="male"
          previewStack={stack}
          previewLogs={logs}
        />

        <DesktopKeyboard />
      </div>
    </ReadOnlyProvider>
  );
}
