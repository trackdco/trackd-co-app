"use client"

import { Sk, SkeletonGroup } from "@/components/feel/Skeleton"
import { SMALL_PHONE_HIDDEN, SMALL_PHONE_NO_TOP } from "@/lib/home/smallPhone"
import { cn } from "@/lib/utils"

/** One Today's Log row: the tick, then the name over its dose and time. */
function RowSk() {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Sk w="24px" h={24} round className="shrink-0" />
      <div className="grid flex-1 gap-1.5">
        <Sk w="46%" h={12} />
        <Sk w="30%" h={10} />
      </div>
    </div>
  )
}

/**
 * Home's cards while the log is unknown (feel pass §1): shaped like Today's
 * Log, the two status cards, the injection-site glance and the journal card,
 * so nothing moves when the real cards rise in. Never the empty state: "Start
 * your log" shown to someone with a full protocol is a wrong statement, not a
 * placeholder.
 */
export function HomeSkeletonBlocks() {
  return (
    <>
      <section className="flow-card inst-card p-5">
        {/* No greeting on a small phone (ruling 2), so the card does not jump
            up when the real one replaces this. */}
        <Sk w="62%" h={26} className={SMALL_PHONE_HIDDEN} />
        <Sk w="72px" h={9} className={cn("mt-4", SMALL_PHONE_NO_TOP)} />
        <div className="mt-4">
          <RowSk />
          <RowSk />
          <RowSk />
          <div className="h-3" />
          <RowSk />
          <RowSk />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="flow-card flex flex-col items-center inst-card p-5">
          <Sk w="40%" h={9} className="self-start" />
          <Sk w="96px" h={96} round className="mt-4" />
          <Sk w="56%" h={8} className="mt-3" />
        </section>
        <section className="flow-card flex flex-col items-center inst-card p-5">
          <Sk w="60%" h={9} className="self-start" />
          <Sk w="40px" h={56} className="mt-4 rounded-lg" />
          <Sk w="70%" h={12} className="mt-3" />
          <Sk w="54%" h={10} className="mt-2" />
        </section>
      </div>

      <section className="flow-card inst-card p-5">
        <div className="flex items-center justify-between">
          <Sk w="96px" h={9} />
          <Sk w="84px" h={24} round />
        </div>
        <div className="mt-4 flex justify-center gap-5">
          <Sk w="34%" h={150} className="rounded-[28px]" />
          <Sk w="34%" h={150} className="rounded-[28px]" />
        </div>
      </section>

      <section className="flow-card inst-card p-5">
        <Sk w="56px" h={9} />
        <Sk h={44} className="mt-3 rounded-xl" />
      </section>
    </>
  )
}

/**
 * The same, as one announced, waving group. `continued` when the route's own
 * skeleton was just on screen: it is already visible, so it does not fade in
 * a second time.
 */
export function HomeSkeleton({ continued = false }: { continued?: boolean }) {
  return (
    <SkeletonGroup label="Loading your log" className="space-y-5" still={continued}>
      <HomeSkeletonBlocks />
    </SkeletonGroup>
  )
}
