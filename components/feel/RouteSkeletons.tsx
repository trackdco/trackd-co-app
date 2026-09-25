"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { VIEW_H, VIEW_W } from "@/lib/calculator/syringe"

import { ArrowLeft, CalendarDots, CaretDown, User } from "@/components/icons"
import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { HomeSkeletonBlocks } from "@/components/home/HomeSkeleton"
import {
  RouteSkeleton,
  RouteSkeletonLeaving,
  Sk,
  SkGraph,
  useArrivedFromSkeleton,
  useSkeletonOnScreen,
} from "@/components/feel/Skeleton"
import { cn } from "@/lib/utils"
import { PAGE_TITLE } from "@/lib/ui-presets"
import { getStripOpen, subscribeStripOpen } from "@/lib/home/weekStripOpen"
import { monthTitle } from "@/lib/calendar/calendar"

/**
 * THE TAB SKELETONS (feel pass §1): what each screen's `loading.tsx` draws the
 * moment its tab is tapped, shaped like that screen so nothing moves when the
 * real one arrives. The title is the real title (it fades in without moving);
 * everything below it is skeleton, waving.
 *
 * Each `*Blocks` is also what the page lays over itself on arrival
 * (`RouteSkeletonLeaving`), so the two can never disagree.
 */

const SCREEN = "relative mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"

/** A screen shell: the real title, then the skeleton. */
function Shell({
  screen,
  title,
  label,
  children,
}: {
  screen: string
  title: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div data-screen={screen} className={SCREEN}>
      <div className="animate-shortcut-fade">{title}</div>
      <RouteSkeleton id={screen} label={label} className="space-y-5">
        {children}
      </RouteSkeleton>
    </div>
  )
}

/* ------------------------------------------------ the page side of the swap */

/**
 * A screen's title wrapper. Fades in where it stands on a fresh arrival; when
 * the route's skeleton was just on screen the title was already there, so it
 * does nothing at all (one arrival, not two).
 */
export function RouteTitle({
  id,
  className,
  children,
  ...rest
}: {
  id: string
  className?: string
  children: ReactNode
} & Record<`data-${string}`, string>) {
  const onScreen = useSkeletonOnScreen(id)
  return (
    <div className={cn(!onScreen && "animate-shortcut-fade", className)} {...rest}>
      {children}
    </div>
  )
}

/**
 * Lays the route's skeleton over the page's first content block and fades it
 * out while the content rises (feel pass §1). Place it directly before that
 * block, in a `relative` screen.
 */
export function RouteHandoff({
  id,
  className = "space-y-5",
  children,
}: {
  id: string
  className?: string
  children: ReactNode
}) {
  const arrived = useArrivedFromSkeleton(id)
  return (
    <RouteSkeletonLeaving show={arrived} className={className}>
      {children}
    </RouteSkeletonLeaving>
  )
}

/* ---------------------------------------------------------------- dashboard */

/**
 * The week strip while nothing about the week is known yet. Each line keeps the
 * real cell's line box (a 20px number, a 15px day name, the 6px dot), and a
 * strip the user has collapsed is drawn collapsed, or every card below jumps
 * when the screen takes over.
 */
function WeekStripBlocks() {
  const open = useSyncExternalStore(subscribeStripOpen, getStripOpen, () => true)
  // Collapsed, it is drawn as the screen draws it: a zero-row grid, which
  // keeps its own gap below (an empty <div> would let that gap merge away).
  if (!open)
    return (
      <div className="grid" style={{ gridTemplateRows: "0fr" }}>
        <div className="overflow-hidden" />
      </div>
    )
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1 py-1.5">
          <span className="flex h-5 items-center">
            <Sk w="18px" h={16} />
          </span>
          <span className="flex h-[15px] items-center">
            <Sk w="22px" h={10} />
          </span>
          <span className="h-1.5 w-1.5" />
        </div>
      ))}
    </div>
  )
}

export function DashboardLoading() {
  const stripOpen = useSyncExternalStore(subscribeStripOpen, getStripOpen, () => true)
  return (
    <div data-screen="dashboard" className={SCREEN}>
      <div className="animate-shortcut-fade">
        {/* The date line waits: the server's date can be a day out from the
            phone's, and a wrong date is worse than a quiet block. */}
        <div className="px-1">
          {/* The eyebrow's 16px line, as a box: a margin here would collapse
              into the gap below it. */}
          <div className="flex h-4 items-center">
            <Sk w="150px" h={10} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="font-sans text-4xl font-light tracking-tight text-foreground">
              Dashboard
            </h1>
            <div aria-hidden className="-mr-1 flex items-center text-text-muted">
              <span className="flex h-10 w-10 items-center justify-center">
                <CaretDown className={cn("h-5 w-5", !stripOpen && "-rotate-90")} />
              </span>
              <span className="flex h-10 w-10 items-center justify-center">
                <CalendarDots className="h-5 w-5" />
              </span>
              <span className="flex h-10 w-10 items-center justify-center">
                <User className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <RouteSkeleton id="dashboard" label="Loading your log" className="space-y-5">
        <WeekStripBlocks />
        <HomeSkeletonBlocks />
      </RouteSkeleton>
    </div>
  )
}

/* ----------------------------------------------------------------- protocol */

function CompoundCardSk() {
  return (
    <div className="flow-card flex w-[150px] shrink-0 flex-col items-center gap-3 inst-card px-3.5 py-5">
      <Sk w="28px" h={74} className="rounded-lg" />
      <Sk w="70%" h={14} className="mt-2" />
      <div className="flex w-full flex-col items-center gap-2">
        <Sk w="64%" h={12} />
        <Sk w="50%" h={12} />
        <Sk w="40%" h={10} />
        <Sk h={4} className="mt-2 rounded-full" />
      </div>
    </div>
  )
}

function ScheduleRowSk() {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Sk w="34%" h={11} />
      <span className="flex-1" />
      <div className="flex gap-[14px]">
        {Array.from({ length: 7 }, (_, i) => (
          <Sk key={i} w="10px" h={10} round />
        ))}
      </div>
    </div>
  )
}

export function ProtocolBlocks() {
  return (
    <>
      <div>
        <Sk w="90px" h={9} className="mx-1" />
        <div className="mt-3 -mx-5 flex gap-3 overflow-hidden px-5">
          <CompoundCardSk />
          <CompoundCardSk />
          <CompoundCardSk />
        </div>
      </div>
      <div>
        <Sk w="70px" h={9} className="mx-1" />
        <section className="flow-card mt-3 inst-card p-5">
          <ScheduleRowSk />
          <ScheduleRowSk />
          <ScheduleRowSk />
          <ScheduleRowSk />
          <ScheduleRowSk />
        </section>
      </div>
    </>
  )
}

export function ProtocolLoading() {
  return (
    <Shell screen="protocol" title={<PageScrollTitle title="Protocol" />} label="Loading your protocol">
      <ProtocolBlocks />
    </Shell>
  )
}

/* --------------------------------------------------------------- calculator */

export function CalculatorBlocks() {
  return (
    <>
      <div className="space-y-3 pb-3">
        <Sk w="44px" h={9} className="mx-1" />
        <Sk w="96px" h={34} />
        {/* The syringe's own box: edge to edge, at the drawing's aspect. */}
        <Sk className="-mx-4 rounded-xl" w="calc(100% + 2rem)" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }} />
      </div>
      <section className="flow-card grid grid-cols-3 divide-x divide-border-default rounded-2xl bg-bg-surface py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2 px-2">
            <Sk w="70%" h={8} />
            <Sk w="46%" h={14} />
          </div>
        ))}
      </section>
      <div className="space-y-3">
        <Sk w="50px" h={9} className="mx-1" />
        <section className="flow-card space-y-4 inst-card p-5">
          <Sk h={30} round />
          <div className="grid grid-cols-2 gap-3">
            <Sk h={44} className="rounded-xl" />
            <Sk h={44} className="rounded-xl" />
          </div>
          <Sk h={44} className="rounded-xl" />
          <Sk h={46} className="rounded-xl" />
        </section>
      </div>
    </>
  )
}

export function CalculatorLoading() {
  return (
    <Shell screen="calculator" title={<PageScrollTitle title="Calculator" />} label="Loading the calculator">
      <CalculatorBlocks />
    </Shell>
  )
}

/* ----------------------------------------------------------------- progress */

function MetricCardSk({ graph }: { graph?: number }) {
  return (
    <section className="flow-card flex flex-col inst-card p-4">
      <Sk w="56%" h={9} />
      <Sk w="62%" h={24} className="mt-3" />
      {graph !== undefined ? (
        <SkGraph height={44} seed={graph} className="mt-4" />
      ) : (
        <>
          <Sk w="80%" h={10} className="mt-3" />
          <Sk w="60%" h={10} className="mt-2" />
        </>
      )}
    </section>
  )
}

export function ProgressBlocks() {
  return (
    <>
      {/* The photo card, as the app draws it: a 4:5 frame, its caption, the
          carousel dots and the running list. */}
      <section className="flow-card inst-card p-5">
        <div className="flex items-center justify-between">
          <Sk w="110px" h={9} />
          <Sk w="10px" h={14} />
        </div>
        <Sk className="mt-4 aspect-[4/5] rounded-2xl" />
        <Sk w="40%" h={13} className="mt-4" />
        <Sk w="62%" h={11} className="mt-2" />
      </section>
      <div className="grid grid-cols-2 gap-3">
        <MetricCardSk graph={1} />
        <MetricCardSk />
        <MetricCardSk />
        <MetricCardSk graph={3} />
      </div>
    </>
  )
}

export function ProgressLoading() {
  return (
    <Shell screen="progress" title={<PageScrollTitle title="Progress" />} label="Loading your progress">
      <ProgressBlocks />
    </Shell>
  )
}

/* ------------------------------------------------------------------ profile */

function ProfileRowSk() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-[18px]">
      <Sk w="34%" h={12} />
      <Sk w="22%" h={12} />
    </div>
  )
}

export function ProfileBlocks() {
  return (
    <>
      <div className="flex flex-col items-center gap-3 pt-1">
        <Sk w="112px" h={112} round />
        <Sk w="52%" h={20} className="mt-2" />
        <Sk w="44%" h={12} />
        <Sk w="80px" h={26} round className="mt-1" />
      </div>
      <div>
        <Sk w="60px" h={9} className="mx-1" />
        <section className="flow-card mt-3 divide-y divide-border-default rounded-2xl bg-bg-surface">
          <ProfileRowSk />
          <ProfileRowSk />
          <ProfileRowSk />
          <ProfileRowSk />
          <ProfileRowSk />
          <ProfileRowSk />
        </section>
      </div>
    </>
  )
}

export function ProfileLoading() {
  return (
    <Shell screen="profile" title={<PageScrollTitle title="Profile" />} label="Loading your profile">
      <ProfileBlocks />
    </Shell>
  )
}

/* ----------------------------------------------------------------- calendar */

export function CalendarBlocks() {
  return (
    <>
      <section className="flow-card inst-card p-5">
        <div className="grid grid-cols-7 gap-y-5">
          {Array.from({ length: 7 * 6 }, (_, i) => (
            <div key={i} className="flex justify-center">
              <Sk w="36px" h={36} round />
            </div>
          ))}
        </div>
      </section>
      <section className="flow-card inst-card p-5">
        <Sk w="60px" h={9} />
        <Sk w="70%" h={14} className="mt-4" />
      </section>
    </>
  )
}

export function CalendarLoading() {
  // The real header, drawn as the screen draws it (the back link, this month's
  // title), so it is already in place when the screen takes over.
  const [now] = useState(() => new Date())
  return (
    <Shell
      screen="calendar"
      title={
        <div className="relative z-10">
          <span className="desktop:hidden -ml-1 inline-flex items-center gap-1.5 text-sm text-text-muted">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Dashboard
          </span>
          <div className="mt-5 px-1">
            <div className="relative">
              <div className="flex items-center gap-1.5 rounded-xl px-1 py-0.5">
                <span className={PAGE_TITLE}>{monthTitle(now.getFullYear(), now.getMonth())}</span>
                <CaretDown className="h-5 w-5 text-text-muted" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      }
      label="Loading the calendar"
    >
      <CalendarBlocks />
    </Shell>
  )
}

/* ------------------------------------------------------------------- weight */

export function WeightBlocks() {
  return (
    <>
      <section className="flow-card inst-card p-5">
        <Sk w="120px" h={9} />
        <div className="mt-4 flex gap-3">
          <Sk h={48} className="flex-1 rounded-xl" />
          <Sk w="8.5rem" h={48} className="shrink-0 rounded-xl" />
        </div>
        <Sk h={44} className="mt-4 rounded-xl" />
      </section>
      <section className="flow-card inst-card p-5">
        <div className="flex items-center justify-between">
          <Sk w="50px" h={9} />
          <Sk w="116px" h={30} round />
        </div>
        <Sk w="96px" h={28} className="mt-3" />
        <SkGraph height={140} seed={2} className="mt-6" />
        <Sk h={36} round className="mt-6" />
      </section>
    </>
  )
}

export function WeightLoading() {
  return (
    <Shell
      screen="weight"
      title={
        <header className="px-1">
          <h1 className={PAGE_TITLE}>Weight</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Log your bodyweight and watch the trend.
          </p>
        </header>
      }
      label="Loading your weight"
    >
      <WeightBlocks />
    </Shell>
  )
}

/* ------------------------------------------------ a plain list of cards */

export function ListBlocks({ cards = 2 }: { cards?: number }) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <section key={i} className="flow-card inst-card p-5">
          <Sk w="96px" h={9} />
          <Sk w="70%" h={14} className="mt-4" />
          <Sk w="54%" h={12} className="mt-2.5" />
          <Sk h={44} className="mt-4 rounded-xl" />
        </section>
      ))}
    </>
  )
}

export function BlocksLoading() {
  return (
    <Shell
      screen="blocks"
      title={
        <>
          {/* The page's back link, so the title does not move when it lands. */}
          <p className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-muted">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Progress
          </p>
          <PageScrollTitle title="Blocks" />
        </>
      }
      label="Loading your blocks"
    >
      <ListBlocks />
    </Shell>
  )
}

/**
 * Notifications and billing: a heading (and the line under it, where the page
 * has one) and a few cards.
 *
 * Not `Shell`, because these two pages are not built like the tabs: they space
 * their blocks with margins rather than `space-y-5`, the first card sits 24px
 * under the title, and they take the desktop `column` measure. The skeleton
 * copies all three, so the handoff lays it exactly where it already was.
 */
export function SettingsLoading({
  screen,
  title,
  subtitle,
  top = "mt-6",
}: {
  screen: string
  title: string
  /** The page's line under its title, word for word, when it has one. */
  subtitle?: string
  /** The gap above the first block, where the page's is not the usual 24px. */
  top?: string
}) {
  return (
    <div
      data-screen={screen}
      data-desktop-layout="column"
      className="relative mx-auto w-full max-w-md px-5 pt-4 pb-5"
    >
      <div className="animate-shortcut-fade">
        <h1 className={PAGE_TITLE}>{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      <RouteSkeleton
        id={screen}
        label={`Loading ${title.toLowerCase()}`}
        className={cn(top, "space-y-5")}
      >
        <ListBlocks cards={3} />
      </RouteSkeleton>
    </div>
  )
}

/**
 * Protocol's Stock, Stacks and Cycles pages: the "‹ Protocol" link and the
 * title stand where the page will put them, over one card of rows.
 */
export function ProtocolSubpageLoading({ title, back = "Protocol" }: { title: string; back?: string }) {
  return (
    <Shell
      screen={`protocol-${title.toLowerCase()}`}
      title={
        <div>
          <p className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-muted">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {back}
          </p>
          <h1 className="mt-1 text-2xl font-light tracking-[-0.02em] text-foreground">{title}</h1>
        </div>
      }
      label={`Loading your ${title.toLowerCase()}`}
    >
      <ListBlocks cards={1} />
    </Shell>
  )
}
