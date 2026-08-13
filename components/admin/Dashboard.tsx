"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Arcade } from "@/components/admin/arcade/Arcade"
import { AutoRefresh } from "@/components/admin/AutoRefresh"
import { CommandPalette, type CommandItem } from "@/components/admin/CommandPalette"
import type { AdminFeedback } from "@/components/admin/FeedbackList"
import { MoneyTab } from "@/components/admin/tabs/Money"
import { OverviewTab } from "@/components/admin/tabs/Overview"
import { ProductTab } from "@/components/admin/tabs/Product"
import { SystemTab } from "@/components/admin/tabs/System"
import { UsersTab } from "@/components/admin/tabs/Users"
import { buildAlerts, worstSeverity } from "@/lib/admin/alerts"
import type { AdminMetrics } from "@/lib/db/admin"
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets"

/**
 * The dashboard shell.
 *
 * WHY THIS IS A CLIENT COMPONENT while everything it renders is not: the page
 * fetches once on the server and hands the whole dataset down, and this handles
 * tab switching, ⌘K, presentation mode and the arcade. Tabs are local state
 * rather than routes so switching is instant — a server round-trip per tab
 * would make a five-tab dashboard feel slower than the one long page it
 * replaced. The RANGE stays a real link, because that genuinely changes what is
 * fetched.
 *
 * Nothing sensitive is shipped by doing this. `AdminMetrics` is counts and
 * labels by construction (`lib/db/admin/core.ts`), and the two row lists were
 * already read through the founder's own RLS-scoped client.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "money", label: "Money" },
  { id: "users", label: "Users" },
  { id: "product", label: "Product" },
  { id: "system", label: "System" },
] as const
type TabId = (typeof TABS)[number]["id"]

const RANGES = [
  { key: "7", label: "7D" },
  { key: "30", label: "30D" },
  { key: "90", label: "90D" },
  { key: "all", label: "All" },
] as const

const SEVERITY_DOT = {
  critical: "bg-admin-negative",
  warning: "bg-accent-amber",
  info: "bg-admin-series-2",
} as const

export function Dashboard({
  metrics,
  feedback,
  emails,
  channels,
  rangeKey,
  signedInAs,
}: {
  metrics: AdminMetrics
  feedback: AdminFeedback[]
  emails: { email: string; source: string | null; created_at: string }[]
  channels: { key: string; label: string; count: number }[]
  rangeKey: string
  signedInAs: string
}) {
  const [tab, setTab] = useState<TabId>("overview")
  const [presenting, setPresenting] = useState(false)
  const [arcadeOpen, setArcadeOpen] = useState(false)

  const alerts = useMemo(() => buildAlerts(metrics), [metrics])
  const worst = worstSeverity(alerts)
  const rangeLabel =
    rangeKey === "all" ? "all time" : `last ${RANGES.find((r) => r.key === rangeKey)?.label ?? "30D"}`

  const togglePresent = useCallback(() => {
    setPresenting((on) => {
      const next = !on
      const el = document.documentElement
      if (next) el.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return next
    })
  }, [])

  // Leaving fullscreen by any route (Escape, the browser chrome) must also
  // leave presentation mode, or the page stays scaled up with no way back.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const tabItems: CommandItem[] = useMemo(
    () => TABS.map((t) => ({ id: t.id, label: t.label, action: () => setTab(t.id) })),
    []
  )

  const commands: CommandItem[] = useMemo(
    () => [
      ...tabItems,
      { id: "games", label: "Games", hint: "Open the arcade", action: () => setArcadeOpen(true) },
      { id: "arcade", label: "Arcade", hint: "Chess, Stack, Titration…", action: () => setArcadeOpen(true) },
      { id: "chess", label: "Chess", hint: "Climb the Elo ladder", action: () => setArcadeOpen(true) },
      {
        id: "present",
        label: presenting ? "Leave presentation mode" : "Presentation mode",
        hint: "Fullscreen, bigger type",
        action: togglePresent,
      },
      { id: "app", label: "Back to the app", action: () => { window.location.href = "/dashboard" } },
    ],
    [tabItems, presenting, togglePresent]
  )

  return (
    <main className={`admin-canvas min-h-dvh ${presenting ? "admin-presenting" : ""}`}>
      <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16 sm:px-6">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className={CARD_EYEBROW}>Trackd</p>
            {worst && (
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${SEVERITY_DOT[worst]}`} />
                <span className="text-[10px] tracking-[0.14em] uppercase text-text-muted">
                  {alerts.length}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <AutoRefresh />
            <button
              type="button"
              onClick={() => setArcadeOpen(true)}
              className="glass-pill text-xs text-text-muted transition-colors hover:text-foreground"
            >
              Arcade
            </button>
            <button
              type="button"
              onClick={togglePresent}
              className="glass-pill text-xs text-text-muted transition-colors hover:text-foreground"
              aria-pressed={presenting}
            >
              {presenting ? "Exit" : "Present"}
            </button>
            <Link
              href="/dashboard"
              className="text-xs text-text-muted transition-colors hover:text-foreground"
            >
              ← App
            </Link>
          </div>
        </header>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className={PAGE_TITLE}>Admin</h1>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/admin?range=${r.key}`}
                scroll={false}
                aria-current={r.key === rangeKey ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  r.key === rangeKey
                    ? "glass-pill text-foreground"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <nav
          aria-label="Dashboard sections"
          className="mt-5 flex gap-1 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:[mask-image:none]"
          role="tablist"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
                tab === t.id
                  ? "glass-pill text-foreground"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] text-text-subtle">{i + 1}</span>
            </button>
          ))}
        </nav>

        {metrics.unavailable && (
          <div className="glass-panel mt-5 px-6 py-5">
            <p className="font-medium text-foreground">Metrics unavailable</p>
            <p className="mt-2 text-sm text-text-muted">
              Cross-user counts need{" "}
              <code className="text-foreground">SUPABASE_SECRET_KEY</code> in this environment.
            </p>
          </div>
        )}

        {/* ── Panels. Keyed so the arrival stagger replays per tab. ─────── */}
        <div className="mt-5" key={tab} role="tabpanel">
          {tab === "overview" && (
            <OverviewTab metrics={metrics} alerts={alerts} rangeLabel={rangeLabel} />
          )}
          {tab === "money" && <MoneyTab metrics={metrics} />}
          {tab === "users" && (
            <UsersTab metrics={metrics} channels={channels} rangeLabel={rangeLabel} />
          )}
          {tab === "product" && <ProductTab metrics={metrics} />}
          {tab === "system" && (
            <SystemTab
              metrics={metrics}
              feedback={feedback}
              emails={emails}
              signedInAs={signedInAs}
            />
          )}
        </div>
      </div>

      <CommandPalette items={commands} tabs={tabItems} placeholder="Jump to, or type games…" />
      {arcadeOpen && <Arcade onClose={() => setArcadeOpen(false)} />}
    </main>
  )
}
