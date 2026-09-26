"use client"

import Link from "next/link"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"

import { Container } from "@/components/containers"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { PopDialog } from "@/components/feel/PopDialog"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { RollNumber } from "@/components/halflife/RollNumber"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CaretRight } from "@/components/icons"
import { CycleRuleSheet } from "@/components/protocol/CycleRuleSheet"
import { CyclesTimeline, type TimelineCycle } from "@/components/protocol/CyclesTimeline"
import { NewItemCard } from "@/components/protocol/NewItemCard"
import { Presence } from "@/components/protocol/pages/Presence"
import { Fold, SquareActions, SubpageShell } from "@/components/protocol/pages/Subpage"
import { containerColour } from "@/lib/containers/colour"
import { inventoryTypeForCompound, isVialForm } from "@/lib/containers/form"
import { endCycle, hiddenEndedCycles, subscribeHiddenEndedCycles, EMPTY_HIDDEN } from "@/lib/home/endedCycleActions"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { toDateKey } from "@/lib/home/mockHomeData"
import { activePause, cyclePauseContext } from "@/lib/home/pauses"
import { cycleColourVar, type CycleRule } from "@/lib/protocol/cycleRule"
import { cycleFacts, cyclePatternText } from "@/lib/protocol/cyclePage"
import {
  OTHER_GROUP,
  PAUSED_GROUP,
  STRIP_DAYS,
  cycleTypeGroups,
  onDaysIn,
  type CycleTypeGroup,
} from "@/lib/protocol/cycleTimeline"
import { addLeaving, dropLeaving, flightDelta, withLeaving, type Leaving } from "@/lib/protocol/cycleExits"
import {
  cyclesHintSeen,
  freshPauses,
  markCyclesHintSeen,
  pausedSeen,
  rememberPausedSeen,
  sameSeen,
  shouldMarkHintSeen,
} from "@/lib/protocol/cyclesHint"
import { endedCycles } from "@/lib/protocol/endedCycles"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import { showToast } from "@/lib/toast"
import { PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import {
  getStackSnapshot,
  isRunning,
  setCompoundCycle,
  subscribeStack,
  type Cadence,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/** The page's eases, as WAAPI needs them (it cannot read a CSS variable):
 *  `--hl-ease` for a slide, `--hl-spring` for a pop. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)"
/** How long the page shows a pause's "before" before the slide (ruling 7):
 *  past the list card's own rise (520ms), so the slide reads on its own. */
const STAGE_BEAT_MS = 650
/** The brief's dim before the slide (§3.10). */
const DIM_MS = 260
/** The slide into Paused, and the flight to Ended (§3.10). */
const FLIGHT_MS = 560
/** A leaving row or group folds shut (the Fold's 280ms), then goes. */
const LEAVE_MS = 320

/** The schedule inside the End question: "daily", "every 3 days", "on Mon and Thu". */
function scheduleWords(cadence: Cadence): string {
  switch (cadence.type) {
    case "daily":
      return "daily"
    case "everyOtherDay":
      return "every other day"
    case "everyNDays":
      return cadence.n === 2 ? "every other day" : `every ${cadence.n} days`
    case "daysOfWeek": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const days = [...cadence.days].sort((a, b) => a - b).map((d) => names[d] ?? "")
      if (days.length === 0) return "on its days"
      if (days.length === 1) return `on ${days[0]}`
      return `on ${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`
    }
  }
}

interface Running {
  c: StackCompound
  rule: CycleRule
  /** The cycle's own colour: the Timeline's lanes (and the calendar). */
  colour: string
  /** The compound's category colour: the row's container and strip (D14,
   *  `r6/cycles8.js` draws each row in its compound's own look). */
  hue: string
  paused: boolean
  /** The compound's pause in force today, when paused (ruling 7's memory). */
  pauseId: string | null
}

type Group = CycleTypeGroup<{ r: Running; leaving: boolean }>

const rowKey = (r: Running) => r.c.id
const groupKey = (g: Group) => g.key

/** A row on its way somewhere: its face, cloned, and where it was. */
interface Ghost {
  node: HTMLElement
  from: DOMRect
  /** Already dimmed in place (the brief's 260ms), so it leaves at 45%. */
  dimmed: boolean
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/** A row's face as a ghost: a copy that cannot be pressed, read or focused. */
function ghostOf(face: HTMLElement): HTMLElement {
  const node = face.cloneNode(true) as HTMLElement
  for (const a of ["data-cycle-face", "data-pressed", "data-press-release", "aria-expanded", "id"]) node.removeAttribute(a)
  node.setAttribute("aria-hidden", "true")
  node.setAttribute("tabindex", "-1")
  node.setAttribute("inert", "")
  node.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"))
  return node
}

/**
 * Fly a ghost from where its row was to `dest` (the Paused header, or the
 * Ended link), fading as it lands, then call `land`. Fixed to the viewport on
 * `<body>`, under the tab bar (z-40) and every sheet and toast. It always
 * cleans up, even if the animation is cancelled.
 */
function fly(g: Ghost, dest: DOMRect | null, kind: "paused" | "ended", land: () => void) {
  const { node, from } = g
  Object.assign(node.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    zIndex: "30",
    pointerEvents: "none",
    background: "var(--bg-surface)",
    borderRadius: "12px",
    opacity: "0",
  })
  document.body.appendChild(node)
  const dy = dest ? flightDelta(from, dest, window.innerHeight) : 24
  const frames: Keyframe[] =
    kind === "paused"
      ? g.dimmed
        ? [
            { opacity: 0.45, transform: "none" },
            { opacity: 0, transform: `translateY(${dy}px) scale(0.97)` },
          ]
        : [
            // Out of a folded type: it surfaces under its header, dimmed, then goes.
            { opacity: 0, transform: "none" },
            { opacity: 0.45, transform: `translateY(${dy * 0.2}px)`, offset: 0.25 },
            { opacity: 0, transform: `translateY(${dy}px) scale(0.97)` },
          ]
      : [
          { opacity: 1, transform: "none" },
          { opacity: 0.85, transform: `translateY(${dy * 0.55}px) scale(0.95)`, offset: 0.55 },
          { opacity: 0, transform: `translateY(${dy}px) scale(0.86)` },
        ]
  let done = false
  const finish = () => {
    if (done) return
    done = true
    node.remove()
    land()
  }
  node.animate(frames, { duration: FLIGHT_MS, easing: EASE, fill: "forwards" }).finished.then(finish, finish)
}

/** The Paused header's impact when a cycle lands in it (§3.10): a short
 *  highlight flash (600ms) and its pause mark pops once. No count bump. */
function impactPaused(root: HTMLElement | null, reduce: boolean) {
  const head = root?.querySelector<HTMLElement>(`[data-cy-head="${PAUSED_GROUP}"]`)
  if (!head) return
  head
    .querySelector<HTMLElement>("[data-cy-flash]")
    ?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], {
      duration: reduce ? 300 : 600,
      easing: "ease-out",
    })
  if (reduce) return
  head
    .querySelector<HTMLElement>("[data-cy-mark]")
    ?.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)", offset: 0.4 }, { transform: "scale(1)" }], {
      duration: 420,
      easing: SPRING,
    })
}

/**
 * Protocol → Cycles (build-brief-final §3.10). "Cycles ?" with "+ New cycle"
 * at top right (ruling 1: a white button in words).
 *
 * The list card groups the running cycles by type, every type folded, with
 * "Tap a type to see its cycles." until the first tap on a type or a row
 * (and only once it has been drawn, F8). A type's header shows its mark, its
 * name and a count, never the compounds. A row: the name, the pattern in
 * words, and the next 28 days as a strip, all in the compound's own look (D14).
 * A tap on a row opens Edit and End. The grouping is the Timeline's
 * (`cycleTypeGroups`, D6), so the two name the same types with the same counts.
 *
 * PAUSED sits LAST, folded, its rows dimmed to 45% (F9). There is ONE pause,
 * the compound's (ruling 7): nothing on this page pauses (that control is not
 * built, ruling 10), so a pause made on Home is shown here on the next visit.
 * The first time the page shows a cycle paused, it draws it where it was, dims
 * it, slides it into the Paused header and the header flashes; this device
 * remembers which pauses it has shown (`cyclesHint.ts`). Reduced motion: the
 * header's flash, as a fade, and nothing moves.
 *
 * End asks, then the compound carries on without weeks off and the cycle
 * lands in Ended (W34): the row folds shut as a ghost of it flies to the
 * "Ended" link, which takes the impact as its count rolls up. The write comes
 * first; the motion only shows it.
 *
 * With no cycle running the page shows its setup card (brief §3.1, F10),
 * whose action is the page's own New cycle. Under the list, the Timeline.
 */
export function CyclesScreen({
  userId,
  backHref,
  endedHref = "/protocol/cycles/ended",
  previewCompounds,
}: {
  userId: string
  backHref?: string
  endedHref?: string
  previewCompounds?: StackCompound[]
}) {
  useCloudHydration(userId)
  const { guard } = useWriteAccess()
  const live = useSyncExternalStore(subscribeStack, () => getStackSnapshot(userId, EMPTY_STACK), () => EMPTY_STACK)
  const logs = useSyncExternalStore(subscribeDoseLogs, () => getDoseLogsSnapshot(userId), () => EMPTY_LOGS)
  const hidden = useSyncExternalStore(subscribeHiddenEndedCycles, () => hiddenEndedCycles(userId), () => EMPTY_HIDDEN)
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? live
  const known = previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const todayKey = toDateKey(new Date())
  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])
  // Read once on the device (never on the server): the slide's fallback.
  const [reduce] = useState(reducedMotion)
  const listRef = useRef<HTMLElement>(null)

  const running = useMemo(() => {
    const out: Running[] = []
    for (const c of active) {
      if (!c.cycle) continue
      if (cycleFacts(c.cycle, todayKey, cyclePauseContext(c.pauses, c.cycle, todayKey)).ended) continue
      const pause = activePause(c.pauses, todayKey)
      out.push({
        c,
        rule: c.cycle,
        colour: cycleColourVar(c.cycle.colour),
        hue: containerColour({ category: c.category }),
        paused: pause !== null,
        pauseId: pause?.id ?? null,
      })
    }
    return out
  }, [active, todayKey])

  /* ---------------------------------------------- ruling 7: the paused slide */

  // Which pauses this page has shown, read from the device the first time the
  // list is known (during render, so the first frame is already the "before").
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null)
  if (known && seen === null && typeof window !== "undefined") setSeen(pausedSeen(userId) ?? new Set<string>())
  const pausedIds = useMemo(() => running.flatMap((r) => (r.pauseId ? [r.pauseId] : [])), [running])
  const fresh = useMemo(() => (seen ? freshPauses(pausedIds, seen) : []), [pausedIds, seen])
  // Reduced motion: nothing is staged; the page shows them paused at once and
  // the Paused header fades its flash (below).
  const [flashNonce, setFlashNonce] = useState(0)
  if (reduce && fresh.length > 0) {
    setSeen(new Set(pausedIds))
    setFlashNonce((n) => n + 1)
  }
  /** Pauses drawn where they were (in their type), until they slide. */
  const staged = useMemo(() => new Set(reduce ? [] : fresh), [reduce, fresh])
  const stagedKey = [...staged].join("|")

  /* ------------------------------------------------ W34: rows on their way */

  const [leavingRows, setLeavingRows] = useState<Leaving<Running>[]>([])
  const [leavingGroups, setLeavingGroups] = useState<Leaving<Group>[]>([])
  const [arriving, setArriving] = useState<string | null>(null)

  // The list as drawn: what runs, plus rows still leaving, grouped the
  // Timeline's way, a staged pause still in its type.
  const drawn = useMemo(() => withLeaving(running, leavingRows, rowKey), [running, leavingRows])
  const shownGroups: Group[] = useMemo(() => {
    const grouped = cycleTypeGroups(
      drawn.map(({ item, leaving }) => ({ r: item, leaving })),
      (e) => e.r.c.category,
      (e) => e.r.paused && !(e.r.pauseId && staged.has(e.r.pauseId)),
    )
    return withLeaving(grouped, leavingGroups, groupKey).map(({ item, leaving }) =>
      leaving ? { ...item, items: item.items.map((e) => ({ ...e, leaving: true })) } : item,
    )
  }, [drawn, staged, leavingGroups])
  // The list as it settles (no stage, nothing leaving): what the hint and the
  // folds are decided by, so neither jumps when a slide or a leave ends.
  const settled = useMemo(
    () =>
      cycleTypeGroups(
        running,
        (r) => r.c.category,
        (r) => r.paused,
      ),
    [running],
  )

  const endedCount = useMemo(() => endedCycles(active, todayKey, hidden).length, [active, todayKey, hidden])
  const candidates = useMemo(() => active.filter((c) => !c.cycle && isRunning(c, todayKey)), [active, todayKey])

  // All folded, except a list with one type, which opens (nothing to choose).
  // Decided when the list is first known and again when it GROWS (a first
  // cycle made here opens its type); never when it shrinks, so ending the last
  // cycle of one type does not throw open another under the cycle on its way
  // to Ended.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [auto, setAuto] = useState<{ len: number; key: string | null } | null>(null)
  if (known && (auto === null || auto.len !== settled.length)) {
    const only = settled.length === 1 && settled[0].key !== PAUSED_GROUP ? settled[0].key : null
    const keep = auto?.key && settled.some((g) => g.key === auto.key) ? auto.key : null
    setAuto({ len: settled.length, key: auto === null || settled.length > auto.len ? only : keep })
  }
  const groupOpen = (key: string) => openGroups[key] ?? key === auto?.key
  const [hintGone, setHintGone] = useState(() => typeof window !== "undefined" && cyclesHintSeen(userId))
  const [hintLeaving, setHintLeaving] = useState(false)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const dropHint = () => {
    // F8: only a hint that is on screen is used up by a tap.
    if (!shouldMarkHintSeen({ drawn: hintRef.current !== null, gone: hintGone, leaving: hintLeaving })) return
    markCyclesHintSeen(userId)
    const el = hintRef.current
    if (!el || reducedMotion()) {
      setHintGone(true)
      return
    }
    setHintLeaving(true)
    el.animate(
      [
        { opacity: 1, height: `${el.offsetHeight}px` },
        { opacity: 0, height: "0px", paddingTop: "0px", paddingBottom: "0px" },
      ],
      { duration: 260, easing: "ease-in", fill: "forwards" },
    ).finished.then(() => setHintGone(true), () => setHintGone(true))
  }

  const [openRow, setOpenRow] = useState<string | null>(null)
  const [editing, setEditing] = useState<StackCompound | null>(null)
  const [ending, setEnding] = useState<Running | null>(null)
  const [picking, setPicking] = useState(false)

  /* ----------------------------------------------------------- flights */

  /** What a switch set up for the next layout: the ghosts, and (for a slide)
   *  the types folding away above Paused, whose height the header is about to
   *  rise by. */
  const flight = useRef<{ kind: "paused" | "ended"; ghosts: Ghost[]; vanishing?: string[]; lift?: number } | null>(null)
  const [flightNonce, setFlightNonce] = useState(0)
  /** Ghosts still on their way to Ended: the link's count waits for them. */
  const [toEnded, setToEnded] = useState(0)
  const [endedBump, setEndedBump] = useState(0)
  const timers = useRef<number[]>([])
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }
  useEffect(() => {
    const list = timers.current
    return () => list.forEach((id) => window.clearTimeout(id))
  }, [])

  // The latest of what the slide needs, for a timer that fires later.
  const latest = useRef({ running, shownGroups, settled, pausedIds, staged })
  useLayoutEffect(() => {
    latest.current = { running, shownGroups, settled, pausedIds, staged }
  })

  // Persist what the page shows as paused, whenever nothing is waiting to slide.
  useEffect(() => {
    if (!known || seen === null || stagedKey) return
    if (!sameSeen(pausedSeen(userId), pausedIds)) rememberPausedSeen(userId, pausedIds)
  }, [known, seen, stagedKey, pausedIds, userId])

  // Reduced motion: the Paused header's flash, as a fade.
  useEffect(() => {
    if (flashNonce > 0) impactPaused(listRef.current, true)
  }, [flashNonce])

  // RULING 7. A pause the page has not shown: after a beat, dim its row where
  // it was (when its type is open), then slide it into Paused.
  useEffect(() => {
    if (!stagedKey) return
    let alive = true
    const beat = window.setTimeout(() => {
      const root = listRef.current
      const { running: rows, staged: ids } = latest.current
      const faces = rows
        .filter((r) => r.pauseId && ids.has(r.pauseId))
        .map((r) => root?.querySelector<HTMLElement>(`[data-cycle-face="${CSS.escape(r.c.id)}"]`) ?? null)
        .filter((f): f is HTMLElement => f !== null)
      // Drawn in an open type? The type's own fold (the group's direct child),
      // not the row's nearest one (its Presence, always open here).
      const inView = (f: HTMLElement) =>
        f.closest("[data-cy-group]")?.querySelector(":scope > .fold")?.getAttribute("data-open") === "true"
      const shown = faces.filter(inView)
      for (const f of shown) f.animate([{ opacity: 1 }, { opacity: 0.45 }], { duration: DIM_MS, easing: "ease-out", fill: "forwards" })
      const go = () => {
        if (!alive) return
        const now = latest.current
        const ghosts: Ghost[] = faces.map((f) => ({ node: ghostOf(f), from: f.getBoundingClientRect(), dimmed: inView(f) }))
        const settledKeys = new Set(now.settled.map((g) => g.key))
        const vanishing = now.shownGroups.flatMap((g, at) => (settledKeys.has(g.key) ? [] : [{ item: g, at }]))
        const shownKeys = new Set(now.shownGroups.map((g) => g.key))
        flight.current = { kind: "paused", ghosts, vanishing: vanishing.map((v) => v.item.key) }
        setLeavingGroups((l) => [...l.filter((x) => !vanishing.some((v) => v.item.key === x.item.key)), ...vanishing])
        setArriving(shownKeys.has(PAUSED_GROUP) ? null : PAUSED_GROUP)
        setSeen(new Set(now.pausedIds))
        rememberPausedSeen(userId, now.pausedIds)
        setFlightNonce((n) => n + 1)
        later(LEAVE_MS, () => {
          setLeavingGroups((l) => l.filter((x) => !vanishing.some((v) => v.item.key === x.item.key)))
          setArriving(null)
        })
      }
      if (shown.length > 0) later(DIM_MS, go)
      else go()
    }, STAGE_BEAT_MS)
    return () => {
      alive = false
      window.clearTimeout(beat)
    }
    // `latest` carries the rest; the slide restarts only for a new set of pauses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedKey])

  // Launch what a switch set up, once the page shows where things now are.
  useLayoutEffect(() => {
    const f = flight.current
    if (!f) return
    flight.current = null
    const root = listRef.current
    if (f.kind === "paused") {
      const head = root?.querySelector<HTMLElement>(`[data-cy-head="${PAUSED_GROUP}"]`) ?? null
      const at = head?.getBoundingClientRect() ?? null
      // Land where the header SETTLES: the types folding away above it (a type
      // whose only cycle was paused) take their height with them.
      const lift = (f.vanishing ?? []).reduce(
        (sum, key) => sum + (root?.querySelector<HTMLElement>(`[data-cy-group="${CSS.escape(key)}"]`)?.offsetHeight ?? 0),
        0,
      )
      const dest = at ? new DOMRect(at.left, at.top - lift, at.width, at.height) : null
      // No row to fly (it could not be found): the header still takes the impact.
      if (f.ghosts.length === 0) impactPaused(root, false)
      let first = true
      for (const g of f.ghosts) {
        fly(g, dest, "paused", () => {
          if (!first) return
          first = false
          impactPaused(listRef.current, false)
        })
      }
      return
    }
    const link = document.querySelector<HTMLElement>("[data-ended-link]")
    const at = link?.getBoundingClientRect() ?? null
    // Land where the link SETTLES, once the ended row has folded away above it.
    const dest = at ? new DOMRect(at.left, at.top - (f.lift ?? 0), at.width, at.height) : null
    for (const g of f.ghosts) {
      fly(g, dest, "ended", () => {
        setToEnded((n) => Math.max(0, n - 1))
        setEndedBump((n) => n + 1)
      })
    }
  }, [flightNonce])

  const end = (r: Running) => {
    const face = listRef.current?.querySelector<HTMLElement>(`[data-cycle-face="${CSS.escape(r.c.id)}"]`) ?? null
    const from = face?.getBoundingClientRect() ?? null
    const at = running.findIndex((x) => x.c.id === r.c.id)
    // What folds away with it: the row, or its whole type when it was the last.
    const lastOfType = settled.find((g) => g.items.some((x) => x.c.id === r.c.id))?.items.length === 1
    const lift =
      (lastOfType ? face?.closest<HTMLElement>("[data-cy-group]") : face?.closest<HTMLElement>("[data-cycle]"))
        ?.offsetHeight ?? 0
    // The write first (B34's lesson): the motion only shows what is saved.
    if (!endCycle(userId, r.c.id, todayKey)) {
      showToast("Couldn’t end it. Try again.")
      return
    }
    setOpenRow(null)
    setLeavingRows((l) => addLeaving(l, { item: r, at: Math.max(0, at) }, rowKey))
    later(LEAVE_MS, () => setLeavingRows((l) => dropLeaving(l, r.c.id, rowKey)))
    if (face && from && from.height > 0 && !reducedMotion()) {
      flight.current = { kind: "ended", ghosts: [{ node: ghostOf(face), from, dimmed: false }], lift }
      setToEnded((n) => n + 1)
      setFlightNonce((n) => n + 1)
    } else {
      setEndedBump((n) => n + 1)
    }
    showToast(`Cycle ended. ${r.c.name} carries on.`, {
      // Today's End version is replaced in place, so the run carries on as if
      // it had never ended.
      undo: () => void setCompoundCycle(userId, r.c.id, r.rule, todayKey),
    })
  }

  const timeline: TimelineCycle[] = useMemo(
    () => running.map((r) => ({ compound: r.c, rule: r.rule, colour: r.colour, paused: r.paused })),
    [running],
  )
  const shownEnded = Math.max(0, endedCount - toEnded)
  const protocolHref = backHref ?? "/protocol"
  const startNew = () => guard(() => setPicking(true))

  return (
    <SubpageShell
      screen="protocol-cycles"
      title="Cycles"
      backHref={backHref}
      explainer="cycles"
      // `open`: the button slides toward what it opened (W21).
      action={{ label: "New cycle", onClick: startNew, open: picking || editing !== null }}
    >
      {!known ? (
        <SkeletonGroup label="Loading your cycles" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      ) : (
        <>
          {shownGroups.length === 0 ? (
            // F10: an empty page shows its own setup card (brief §3.1).
            <div className="animate-home-up">
              <NewItemCard
                label="New cycle"
                onClick={startNew}
                description="Run a compound on and off, or to an end date."
                preview={<CyclePreview />}
              />
            </div>
          ) : (
            <section ref={listRef} className="animate-home-up inst-card px-4 py-1.5">
              {settled.length > 1 && !hintGone ? (
                <p ref={hintRef} className="overflow-hidden pt-2.5 pb-1 text-[12px] text-text-muted">
                  Tap a type to see its cycles.
                </p>
              ) : null}
              {shownGroups.map((g, gi) => {
                const open = groupOpen(g.key)
                const leaving = g.items.every((e) => e.leaving)
                return (
                  <Presence key={g.key} show={!leaving} appear={arriving === g.key}>
                    <div data-cy-group={g.key} className={cn(gi > 0 && "hairline-t border-border-default")}>
                      <button
                        type="button"
                        data-cy-head={g.key}
                        aria-expanded={open}
                        onClick={() => {
                          dropHint()
                          setOpenGroups((s) => ({ ...s, [g.key]: !open }))
                        }}
                        className={cn(PRESS.row, "relative flex w-full items-center gap-2 py-3 text-left")}
                      >
                        {/* The Paused header's impact (§3.10): a short flash. */}
                        <span
                          data-cy-flash
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0.5 -inset-x-2 rounded-xl bg-bg-surface-raised opacity-0"
                        />
                        <span data-cy-mark className="relative flex">
                          <GroupMark group={g} />
                        </span>
                        <span className="relative text-[13px] text-foreground">{g.label}</span>
                        <span className="relative font-mono text-[11.5px] text-text-muted">
                          {g.items.filter((e) => !e.leaving).length || g.items.length}
                        </span>
                        <span className="flex-1" />
                        <CaretRight className="cy-chev relative h-4 w-4 text-text-muted" aria-hidden />
                      </button>
                      <Fold open={open}>
                        {g.items.map(({ r, leaving: rowLeaving }, i) => (
                          <Presence key={r.c.id} show={!rowLeaving}>
                            <CycleRow
                              r={r}
                              paused={g.key === PAUSED_GROUP}
                              first={i === 0}
                              todayKey={todayKey}
                              open={openRow === r.c.id}
                              onToggle={() => {
                                dropHint()
                                setOpenRow(openRow === r.c.id ? null : r.c.id)
                              }}
                              onEdit={() => guard(() => setEditing(r.c))}
                              onEnd={() => guard(() => setEnding(r))}
                            />
                          </Presence>
                        ))}
                      </Fold>
                    </div>
                  </Presence>
                )
              })}
            </section>
          )}

          {timeline.length > 0 ? <CyclesTimeline cycles={timeline} logs={logs} todayKey={todayKey} /> : null}

          {endedCount > 0 ? (
            <EndedLink href={endedHref} count={shownEnded} bump={endedBump} waiting={shownEnded === 0} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title="End this cycle?"
        line={
          ending
            ? `${ending.c.name} keeps going, ${scheduleWords(ending.c.schedule.cadence)}, without weeks off. Your logs stay, and you can restart it from Ended.`
            : undefined
        }
        confirmLabel="End cycle"
        onConfirm={() => {
          if (ending) end(ending)
        }}
      />

      <PopDialog open={picking} onClose={() => setPicking(false)} title="New cycle">
        {candidates.length === 0 ? (
          <>
            <p className="mt-2 text-[13.5px] leading-snug text-text-muted">
              {active.length === 0 ? "Add a compound on Protocol first." : "Every compound is on a cycle."}
            </p>
            {active.length === 0 ? (
              <Link href={protocolHref} className={cn(PRIMARY_BUTTON, "mt-4 w-full")}>
                Go to Protocol
              </Link>
            ) : null}
          </>
        ) : (
          <div className="inst-rows mt-3 max-h-[50vh] overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicking(false)
                  setEditing(c)
                }}
                className={cn(PRESS.row, "flex w-full items-center gap-2.5 px-3 py-2.5 text-left")}
              >
                <Container
                  name={c.name}
                  inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                  category={c.category}
                  fill={0.6}
                  size={22}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </PopDialog>

      <CycleRuleSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        compoundName={editing?.name ?? ""}
        cycle={editing?.cycle ?? null}
        vialTracked={editing ? isVialForm(inventoryTypeForCompound(editing.name, editing.method, editing.inventoryForm)) : false}
        onSave={(cycle) => {
          // The write says whether it took (a compound gone from this device,
          // a storage that refused): "Saved" only when it did.
          if (editing && cycle) {
            showToast(setCompoundCycle(userId, editing.id, cycle) ? "Saved" : "Couldn’t save. Try again.")
          }
          setEditing(null)
        }}
      />
    </SubpageShell>
  )
}

/** A type's mark: its Solid glyph in its colour; Paused and Other in grey. */
function GroupMark({ group }: { group: Group }) {
  if (group.key === PAUSED_GROUP) return <SolidIcon name="pause" size={14} tone="off" />
  if (group.key === OTHER_GROUP || !group.category) return <SolidIcon name="all" size={14} tone="off" />
  return (
    <SolidIcon name={CATEGORY_GLYPH[group.category] ?? "catPeptide"} size={14} hue={`var(--cat-${group.category})`} />
  )
}

/**
 * "Ended N ›" (§3.10), and where an ended cycle lands (W34): each landing
 * makes an impact (the card gives a little under it) and the count rolls up
 * to the new number. `waiting`: the first cycle ever ended is still on its
 * way, so the link holds its place unseen and appears as it lands. Reduced
 * motion: the count changes with a short fade, and nothing moves.
 */
function EndedLink({ href, count, bump, waiting }: { href: string; count: number; bump: number; waiting: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null)
  // Rose with the page, or arrived later (a first End): only the first rises.
  const [withPage] = useState(() => waiting === false && bump === 0)
  const lastBump = useRef(bump)
  useEffect(() => {
    if (bump === lastBump.current) return
    lastBump.current = bump
    const el = ref.current
    if (!el) return
    if (reducedMotion()) {
      el.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 200, easing: "ease-out" })
      return
    }
    el.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.97)", offset: 0.25 },
        { transform: "scale(1.015)", offset: 0.6 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 460, easing: SPRING },
    )
  }, [bump])
  return (
    <Link
      ref={ref}
      href={href}
      data-ended-link
      aria-hidden={waiting || undefined}
      tabIndex={waiting ? -1 : undefined}
      className={cn(
        PRESS.card,
        withPage && "animate-home-up",
        "inst-card flex items-center justify-between px-4 py-3.5 text-[13.5px] text-foreground transition-opacity duration-200",
        waiting && "pointer-events-none opacity-0",
      )}
      style={withPage ? { animationDelay: "120ms" } : undefined}
    >
      <span>Ended</span>
      <span className="flex items-center gap-1.5 font-mono text-[12px] text-text-muted">
        <RollNumber text={String(Math.max(1, count))} rollKey={bump} />
        <CaretRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  )
}

/** What a cycle looks like, dimmed on the empty page's setup card (F10): a
 *  row as the list draws it. Decorative; the card hides it from screen readers. */
function CyclePreview() {
  const hue = containerColour({ category: "peptide" })
  return (
    <span className="flex w-[236px] max-w-full items-center gap-2.5">
      <Container inventoryType="reconstituted" category="peptide" fill={0.6} size={22} />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="text-[13.5px] text-foreground">BPC-157</span>
        <span className="text-[11.5px] text-text-muted">5 days on, 2 off</span>
      </span>
      <span className="cy-strip flex w-[74px] shrink-0 items-end gap-px" style={{ "--hue": hue } as CSSProperties}>
        {Array.from({ length: STRIP_DAYS }, (_, d) => (
          <i key={d} data-on={d % 7 < 5 ? "true" : "false"} />
        ))}
      </span>
    </span>
  )
}

/** A running cycle: name, pattern, the next 28 days; opens onto Edit and End. */
function CycleRow({
  r,
  paused,
  first,
  todayKey,
  open,
  onToggle,
  onEdit,
  onEnd,
}: {
  r: Running
  /** Drawn in Paused: dimmed, "Paused" in place of the strip. A pause still
   *  waiting to slide is drawn in its type, as it was. */
  paused: boolean
  first: boolean
  todayKey: string
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onEnd: () => void
}) {
  const strip = useMemo(
    () => onDaysIn(r.rule, r.c.pauses, todayKey, [0, STRIP_DAYS]),
    [r.rule, r.c.pauses, todayKey],
  )
  return (
    <div data-cycle={r.c.id} className={cn(!first && "hairline-t border-border-default")}>
      <button
        type="button"
        data-cycle-face={r.c.id}
        onClick={onToggle}
        aria-expanded={open}
        className={cn(PRESS.row, "flex w-full items-center py-2.5 text-left")}
      >
        {/* F9: a paused row's whole content dims to 45%, not the container alone. */}
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 transition-opacity duration-[260ms] ease-out",
            paused && "opacity-45",
          )}
        >
          <span className="flex shrink-0">
            {/* D14: the compound's own look (its category), as the reference draws it. */}
            <Container
              name={r.c.name}
              inventoryType={inventoryTypeForCompound(r.c.name, r.c.method, r.c.inventoryForm)}
              category={r.c.category}
              fill={0.6}
              size={22}
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] text-foreground">{r.c.name}</span>
            <span className="text-[11.5px] text-text-muted">{cyclePatternText(r.rule.pattern)}</span>
          </span>
          {paused ? (
            <span className="shrink-0 text-[11.5px] text-text-muted">Paused</span>
          ) : (
            <span
              aria-hidden
              className="cy-strip flex w-[74px] shrink-0 items-end gap-px"
              style={{ "--hue": r.hue } as CSSProperties}
            >
              {strip.map((on, d) => (
                <i key={d} data-on={on ? "true" : "false"} />
              ))}
            </span>
          )}
        </span>
      </button>
      <Fold open={open} className="pb-3">
        <SquareActions
          actions={[
            { label: "Edit", icon: "edit", onClick: onEdit },
            { label: "End", icon: "end", destructive: true, onClick: onEnd },
          ]}
        />
      </Fold>
    </div>
  )
}
