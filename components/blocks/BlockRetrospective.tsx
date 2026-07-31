"use client"

import { useMemo, useSyncExternalStore } from "react"

import { cn } from "@/lib/utils"
import { Container } from "@/components/containers/Container"
import { useMounted } from "@/components/home/useMounted"
import { CARD_EYEBROW, DATA_MONO, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { blockWindow, formatDuration, type Block } from "@/lib/blocks/block"
import { buildRetrospective, comparePair } from "@/lib/blocks/retrospective"
import { computeAdherenceOver } from "@/lib/progress/consistency"
import { formatPhotoDateShort, poseLabel } from "@/lib/progress/photos"
import type { BloodworkPhoto } from "@/lib/progress/bloodwork"
import type { JournalEntry } from "@/lib/progress/journal"
import type { ProgressPhoto } from "@/lib/progress/photos"
import {
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import { ReflectionEditor } from "@/components/blocks/ReflectionEditor"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * The look-back — the whole point of the feature (Adrian, 2026-07-30).
 *
 * Every figure here is a QUERY over the block's window. Nothing was captured for
 * it and nothing is stored, which is what makes it cheap to build and impossible
 * to copy: a competitor can ship a progress ring in an afternoon and cannot ship
 * "here are the sixteen weeks of your first prep, the eleven compounds you ran,
 * your first and last photo side by side, and the bloods you took in the middle"
 * without having held that data for sixteen weeks.
 *
 * Two things it deliberately never does:
 *
 *  - **It never judges.** No "on track", no "you missed your target", no colour
 *    that means good or bad. `architecture.md`'s categorical-never-evaluative
 *    rule is about health data, and a delta of minus four kilograms with no
 *    verdict attached is exactly the shape everything here takes.
 *  - **It never invents a section.** A block with no photos in it shows no photo
 *    section at all, rather than an empty state apologising for the absence.
 *
 * The stack and dose log come from the DEVICE stores, like Progress's own
 * consistency and running list, because that is still where the dosing model is
 * read from. Everything else is server-fetched from Postgres.
 */
export function BlockRetrospective({
  block,
  todayKey,
  userId,
  weight,
  photos,
  bloods,
  journal,
  /** Dev-preview-only: inject the device stack + logs without signing in. */
  sampleStack,
  sampleLogs,
}: {
  block: Block
  todayKey: string
  userId: string
  weight: { key: string; kg: number }[]
  photos: ProgressPhoto[]
  bloods: BloodworkPhoto[]
  journal: JournalEntry[]
  sampleStack?: StackCompound[]
  sampleLogs?: DayLogs
}) {
  const mounted = useMounted()
  const deviceReady = sampleStack ? true : mounted

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS,
  )
  const stack = sampleStack ?? liveStack
  const logs = sampleLogs ?? liveLogs

  const retro = useMemo(() => {
    // Adherence is computed OVER THE BLOCK'S OWN WINDOW, using the same per-day
    // rule Progress uses. It used to clip Progress's series, which walks back
    // from today and caps at a year — so a block that ran eighteen months ago
    // fell outside it entirely and this screen printed a headline 0% directly
    // beneath its own list of the doses logged in that window.
    const w = blockWindow(block, todayKey)
    const adherence = deviceReady
      ? computeAdherenceOver(stack, logs, w.from, w.to)
      : []
    return buildRetrospective(block, todayKey, {
      weight,
      stack: deviceReady ? stack : [],
      logs: deviceReady ? logs : {},
      adherence,
      photos,
      bloods,
      journal,
    })
  }, [block, todayKey, deviceReady, stack, logs, weight, photos, bloods, journal])

  const live = block.status === "active"
  const pair = retro.photos ? comparePair(retro.photos) : null
  const consistencyTarget =
    block.targets.find((t) => t.variable === "consistency") ?? null

  const hasAnything =
    retro.weight != null ||
    retro.compounds.length > 0 ||
    retro.photos != null ||
    retro.bloods.length > 0 ||
    retro.journal.entries > 0 ||
    retro.consistency.pct != null

  return (
    <div className="space-y-5">
      {/* Duration — the one figure that always exists, for every block there
          will ever be. A live block reads "so far" rather than claiming the
          whole span it was planned for. */}
      <section className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>{live ? "Running for" : "Ran for"}</p>
        <p className="mt-1.5 flex items-baseline gap-2">
          <span className={METRIC_VALUE}>{formatDuration(retro.window.days)}</span>
          {live && <span className={UNIT_SUFFIX}>so far</span>}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {formatPhotoDateShort(retro.window.from)} to{" "}
          {formatPhotoDateShort(retro.window.to)}
        </p>
      </section>

      {/* Only once the device stores are readable. Doses and consistency come
          from localStorage, which the first paint cannot see, so a block whose
          content is doses and nothing else asserted that nothing had been logged
          in it and then contradicted itself a frame later. Saying nothing for
          one frame is the honest version of not knowing yet. */}
      {deviceReady && !hasAnything && (
        <p className="px-1 text-sm text-text-muted">
          Nothing has been logged inside this block yet. Weight, photos, doses,
          bloods and journal entries all show up here on their own as you go.
        </p>
      )}

      {/* Weight — start, end, delta, and the graph clipped to the window. */}
      {retro.weight && (
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Weight</p>
          {/* One reading has no delta, so the reading itself is the headline.
              Showing "0 kg" over "92.4 to 92.4 kg" read as a measured outcome. */}
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className={METRIC_VALUE}>
              {retro.weight.delta === null
                ? formatKg(retro.weight.to)
                : formatKg(retro.weight.delta, true)}
            </span>
            <span className={UNIT_SUFFIX}>kg</span>
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {retro.weight.delta === null ? (
              <>One reading in this block</>
            ) : (
              <>
                {formatKg(retro.weight.from)} to {formatKg(retro.weight.to)} kg, across{" "}
                {retro.weight.points.length} readings
              </>
            )}
          </p>
          {retro.weight.points.length > 1 && (
            <WindowSparkline values={retro.weight.points.map((p) => p.kg)} />
          )}
        </section>
      )}

      {/* Photos — first and last session side by side. */}
      {retro.photos && (
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Photos</p>
          <p className="mt-1.5 text-sm text-text-muted">
            {retro.photos.sessions}{" "}
            {retro.photos.sessions === 1 ? "session" : "sessions"} inside this block
          </p>
          {pair ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ComparePane photo={pair.before} caption="First" />
              <ComparePane photo={pair.after} caption="Last" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ComparePane
                photo={retro.photos.first[0]}
                caption={formatPhotoDateShort(retro.photos.first[0].date)}
              />
            </div>
          )}
        </section>
      )}

      {/* What you ran — the thing Adrian described wanting to look back on. */}
      {retro.compounds.length > 0 && (
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>What you ran</p>
          <ul className="mt-3 space-y-1.5">
            {retro.compounds.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5"
              >
                <Container
                  inventoryType={inventoryTypeForCompound(c.name, c.method)}
                  category={c.category}
                  fill={0.7}
                  size={28}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {c.name}
                </span>
                <span className={cn(DATA_MONO, "shrink-0")}>
                  {c.doses} {c.doses === 1 ? "dose" : "doses"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Consistency — behavioural, not a health reading, which is why it is
          allowed to be a percentage at all. */}
      {retro.consistency.pct != null && (
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Consistency</p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className={METRIC_VALUE}>{retro.consistency.pct}</span>
            <span className={UNIT_SUFFIX}>%</span>
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {retro.consistency.logged} of {retro.consistency.due} doses logged, across{" "}
            {retro.consistency.doseDays}{" "}
            {retro.consistency.doseDays === 1 ? "day" : "days"} with doses due
          </p>
          {/* The consistency TARGET, stated beside the figure. This is the one
              screen that has both, so it is where the target the create sheet
              offers actually means something. It states the number and stops —
              no "met" or "missed", because a verdict on your own adherence is
              still a verdict. */}
          {consistencyTarget && (
            <p className="mt-2 text-xs text-text-subtle">
              Target {trimTarget(consistencyTarget.value)}%
            </p>
          )}
        </section>
      )}

      {/* Bloods — panels taken during the window. */}
      {retro.bloods.length > 0 && (
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Bloods</p>
          <p className="mt-1.5 text-sm text-text-muted">
            {retro.bloods.length} {retro.bloods.length === 1 ? "panel" : "panels"} inside
            this block
          </p>
          <ul className="mt-3 space-y-1.5">
            {retro.bloods.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5"
              >
                <span className={cn(DATA_MONO, "shrink-0")}>
                  {formatPhotoDateShort(p.date)}
                </span>
                {p.note && (
                  <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                    {p.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Journal — a count and the markers noted most often. A count is a fact
          about how often something was written down. Nothing here reports a
          marker's severity or ranks one as worse than another. */}
      {retro.journal.entries > 0 && (
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Journal</p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className={METRIC_VALUE}>{retro.journal.entries}</span>
            <span className={UNIT_SUFFIX}>
              {retro.journal.entries === 1 ? "entry" : "entries"}
            </span>
          </p>
          {retro.journal.topMarkers.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-subtle">Noted most often</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {retro.journal.topMarkers.map((m) => (
                  <li
                    key={m.name}
                    className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-xs text-text-muted"
                  >
                    {m.name}{" "}
                    <span className="font-mono tabular-nums text-text-subtle">
                      {m.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {retro.journal.latest?.body && (
            <p className="mt-3 border-l border-border-default pl-3 text-sm text-text-muted">
              {truncate(retro.journal.latest.body, 220)}
            </p>
          )}
        </section>
      )}

      {/* The reflection — the one thing in here the data cannot produce. */}
      <ReflectionEditor block={block} />
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function ComparePane({ photo, caption }: { photo: ProgressPhoto; caption: string }) {
  return (
    <figure className="min-w-0">
      <div className="aspect-[3/4] w-full overflow-hidden rounded-xl bg-bg-surface-raised">
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={`${poseLabel(photo.pose)}, ${formatPhotoDateShort(photo.date)}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-subtle">
            Image unavailable
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 text-xs text-text-muted">
        {caption} <span className="text-text-subtle">· {poseLabel(photo.pose)}</span>
        <span className="mt-0.5 block font-mono tabular-nums text-text-subtle">
          {formatPhotoDateShort(photo.date)}
        </span>
      </figcaption>
    </figure>
  )
}

const SPARK_W = 260
const SPARK_H = 44

/**
 * The weight graph, clipped to the block. The same polyline idiom as the
 * dashboard's glance sparkline rather than a second charting approach — one
 * screen drawing weight differently from another is the kind of detail that
 * reads as sloppy without anyone being able to say why.
 *
 * `--chart-line` is the token, not `--accent-primary`: `ui-context.md` names
 * glance sparklines as the ONE sanctioned exception and gives them the neutral
 * chart hues, and drawing the same user's weight white here and periwinkle on
 * Progress is two screens disagreeing about one number.
 *
 * No colour carries meaning here: a loss and a gain are the same line. Which of
 * them is good is not the app's call.
 */
function WindowSparkline({ values }: { values: number[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = values.length > 1 ? SPARK_W / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = i * step
      const y = SPARK_H - ((v - min) / range) * (SPARK_H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="mt-3 h-11 w-full"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** "84.2", or "-4.2" / "+4.2" when signed. One decimal, trailing zero dropped. */
function formatKg(n: number, signed = false): string {
  const v = Number(n.toFixed(1))
  if (!signed) return String(v)
  return v > 0 ? `+${v}` : String(v)
}

/** One decimal at most, trailing zero dropped. */
function trimTarget(n: number): string {
  return String(Number(n.toFixed(1)))
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`
}
