"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"

import { useMounted } from "@/components/home/useMounted"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { WeightView } from "@/components/weight/WeightView"
import {
  saveStack,
  notifyStackChanged,
  type StackCompound,
} from "@/lib/home/stack"
import { toDateKey, type DateKey } from "@/lib/home/mockHomeData"

/**
 * Seeds a throwaway "preview-archive" stack (one ARCHIVED catalogue compound + one
 * active one for contrast), then renders the real Add-to-Stack search and the real
 * Weight view against mock data. The live wiring (cloud hydration / dual-writes)
 * no-ops gracefully without a session. Re-seeds to this mock on every page load.
 */
const USER = "preview-archive"

function dayOffset(days: number): DateKey {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

function buildStack(): StackCompound[] {
  return [
    {
      // Archived → in the search it reads dimmed with a Reactivate (↺) control.
      id: "pv-arch-testc",
      name: "Testosterone Cypionate",
      category: "anabolic",
      method: "im",
      dose: 250,
      unit: "mg",
      schedule: {
        cadence: { type: "everyOtherDay" },
        timeOfDay: "09:00",
        startDate: dayOffset(-30),
      },
      rotationSites: ["im-vglute-r", "im-vglute-l", "im-glute-r", "im-glute-l"],
      rotationIndex: 0,
      archived: true,
    },
    {
      // Active + in the log → shows the blocked ✓ ("already in your log").
      id: "pv-act-tb500",
      name: "TB-500",
      category: "peptide",
      method: "subq",
      dose: 2.5,
      unit: "mg",
      schedule: {
        cadence: { type: "daysOfWeek", days: [1, 4] },
        timeOfDay: "08:00",
        startDate: dayOffset(-10),
      },
      rotationSites: ["sq-abdo-l", "sq-abdo-r"],
      rotationIndex: 0,
    },
  ]
}

function buildWeight(): { key: DateKey; kg: number }[] {
  const today = new Date()
  return Array.from({ length: 28 }, (_, i) => {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (27 - i)
    )
    const noise = i % 3 === 0 ? 0.5 : i % 2 === 0 ? -0.4 : 0.1
    return { key: toDateKey(d), kg: Math.round((92 - i * 0.12 + noise) * 10) / 10 }
  })
}

export function ArchiveWeightPreview() {
  const mounted = useMounted()
  const stack = useMemo(() => buildStack(), [])
  const weight = useMemo(() => buildWeight(), [])
  const todayKey = useMemo(() => toDateKey(new Date()), [])
  const [menuOpen, setMenuOpen] = useState(false)

  // Seed the throwaway preview store (no setState → no cascading render).
  useEffect(() => {
    saveStack(USER, stack)
    notifyStackChanged()
  }, [stack])

  if (!mounted) return null

  return (
    <div className="flex min-h-dvh flex-col">
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
          Preview · Archive &amp; Weight
        </span>
      </header>

      <main className="flex-1 pb-10">
        {/* ── 1. Archived compound in search → Reactivate ─────────────── */}
        <section className="mx-auto w-full max-w-md px-5 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Archive → search → reactivate
          </p>
          <h1 className="mt-2 font-display text-2xl font-medium tracking-[-0.01em] text-foreground">
            Reactivate from search
          </h1>
          <ol className="mt-3 space-y-1.5 text-sm text-text-muted">
            <li>
              1. Tap <span className="text-foreground">Open Add to Stack</span>,
              then search{" "}
              <span className="text-foreground">test</span>.
            </li>
            <li>
              2.{" "}
              <span className="text-foreground">Testosterone Cypionate</span> is
              archived — it reads dimmed with an amber{" "}
              <span className="text-accent-amber">↺</span> on the right. Tap it to
              open the reactivate sheet — re-tune the dose, schedule or sites, then
              save and it resumes from today.
            </li>
            <li>
              3. For contrast: <span className="text-foreground">TB-500</span> is
              active, so it shows the blocked ✓. Search{" "}
              <span className="text-foreground">deca</span> to see a normal add (+).
            </li>
          </ol>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="mt-4 w-full rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
          >
            Open Add to Stack
          </button>
        </section>

        {/* ── 2. Weight defaults to Scale ─────────────────────────────── */}
        <section className="border-t border-border-default pt-2">
          <p className="mx-auto w-full max-w-md px-6 pt-4 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Weight should open on{" "}
            <span className="text-foreground">Scale</span>, not Trend
          </p>
          <WeightView
            entries={weight}
            unitPreference="metric"
            todayKey={todayKey}
          />
        </section>
      </main>

      <AddToStackMenu open={menuOpen} onOpenChange={setMenuOpen} userId={USER} />
    </div>
  )
}
