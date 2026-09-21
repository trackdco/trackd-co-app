"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"

import {
  Calculator,
  CalendarDots,
  ChartLine,
  SquaresFour,
  Syringe,
  User,
  type Icon,
} from "@/components/icons"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { SignOutConfirm } from "@/components/auth/sign-out-confirm"
import { useIsDesktop } from "@/lib/desktop/breakpoint"
import {
  getStackSnapshot,
  isRunning,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import { toDateKey } from "@/lib/home/mockHomeData"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []

type Tab = { href: string; label: string; icon: Icon; key: string }

/**
 * SIX, where the phone's bottom bar has five.
 *
 * Calendar is the addition, and it is not a new feature: on the phone it is
 * reached from an icon in the Dashboard header because a sixth thumb target
 * would not fit. A sidebar has the room, so the thing that was one tap behind an
 * icon becomes one click in the open. Nothing is removed and no route is new.
 */
const TABS: Tab[] = [
  { href: "/dashboard", label: "Dashboard", icon: SquaresFour, key: "1" },
  { href: "/protocol", label: "Protocol", icon: Syringe, key: "2" },
  { href: "/calculator", label: "Calculator", icon: Calculator, key: "3" },
  { href: "/progress", label: "Progress", icon: ChartLine, key: "4" },
  { href: "/calendar", label: "Calendar", icon: CalendarDots, key: "5" },
  { href: "/profile", label: "Profile", icon: User, key: "6" },
]

function isActive(pathname: string, href: string): boolean {
  // Same rule as the bottom nav: Dashboard matches only itself, the rest also
  // match their nested children so the tab stays lit on a deeper screen.
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The desktop sidebar — the left column of the shell, and the replacement for
 * the phone's fixed bottom tab bar.
 *
 * ## It renders on the phone too, and costs nothing there
 *
 * `app/desktop.css` gives this element `display: flex` only inside the desktop
 * media query; a phone's stylesheet never matches, so the element is `hidden`
 * (the attribute below) and draws nothing. That is the whole reason the shell
 * can be CSS-placed with no hydration flash: the server renders one tree and the
 * browser decides on the first paint, with no JavaScript in the path.
 *
 * The one thing that would genuinely cost a phone something is the live
 * "Running" list, which subscribes to the stack store and resolves each
 * compound. That is gated on {@link useIsDesktop} so a phone never does the
 * work — see the note on that hook about why gating WORK is fine and gating
 * SHAPE is not.
 */
export function DesktopSidebar({
  userId,
  previewStack,
}: {
  userId: string
  /** Dev-preview only: render the "Running" list without a signed-in read.
   *  Same convention as `ProtocolScreen` / `ProgressScreen`. */
  previewStack?: StackCompound[]
}) {
  const pathname = usePathname() ?? ""
  const isDesktop = useIsDesktop()

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => (isDesktop ? getStackSnapshot(userId, EMPTY_STACK) : EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const stack = previewStack ?? liveStack

  /**
   * "Running" is date-dependent: a compound on a 5-on/2-off cycle that has
   * reached its end date is archived-by-schedule rather than archived by flag,
   * and `isRunning` needs the day to know. Today is read at render rather than
   * held in state because this list only ever renders after hydration (the
   * server snapshot is empty), so there is no SSR value to mismatch against.
   */
  const today = toDateKey(new Date())
  const running = stack.filter((c) => isRunning(c, today)).slice(0, 8)

  return (
    <aside
      data-desktop-sidebar=""
      aria-label="Primary"
      /*
        VISIBILITY IS A CLASS PAIR, NOT THE `hidden` ATTRIBUTE.

        The attribute was the obvious choice and it does not work: Tailwind v4's
        preflight ships `[hidden]:where(:not([hidden='until-found'])) { display:
        none !important }`, and no rule in `desktop.css` can outrank an
        `!important` from a stylesheet loaded ahead of it. The element stayed
        invisible at every width and the sidebar simply never appeared.

        `hidden desktop:flex` is Tailwind against Tailwind: same layer, same
        specificity, and the variant is emitted after the base utility, so the
        media query wins on order. It is also the exact pattern the retired
        desktop interstitial used (`hidden lg:flex`).

        `display: none` removes the element from the accessibility tree just as
        the attribute did, so a phone still never meets a second nav.
      */
      className="hidden desktop:flex"
    >
      <Link
        href="/dashboard"
        aria-label="Trakabl, go to dashboard"
        className="mb-6 block rounded-lg px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Image
          src="/trackd-wordmark.png"
          alt="Trakabl"
          width={1049}
          height={200}
          priority
          className="h-4 w-auto"
        />
      </Link>

      <nav className="flex flex-col gap-0.5">
        {TABS.map(({ href, label, icon: Ico, key }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.8125rem] transition-colors duration-200",
                active
                  ? "bg-bg-surface text-foreground"
                  : "text-text-subtle hover:bg-bg-surface/60 hover:text-text-muted",
              )}
            >
              <Ico className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {/* The key that jumps here. Muted to the point of being a detail
                  you find rather than a label you read. */}
              <kbd
                aria-hidden
                className="rounded border border-border-default px-1 font-mono text-[0.5625rem] leading-[1.4] text-text-subtle"
              >
                {key}
              </kbd>
            </Link>
          )
        })}
      </nav>

      {/* WHAT YOU ARE RUNNING — standing context, not navigation. It is the
          question the sidebar can answer for free on every screen and the phone
          can only answer by going to Protocol. */}
      {running.length > 0 ? (
        <div className="mt-6 border-t border-border-default pt-5">
          <h2 className={cn(CARD_EYEBROW, "px-3")}>Running</h2>
          <ul className="mt-2.5 flex flex-col gap-0.5">
            {running.map((c) => (
              <li key={c.id}>
                <Link
                  href="/protocol"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs text-text-muted transition-colors duration-200 hover:bg-bg-surface/60 hover:text-foreground"
                >
                  <CategoryIcon category={c.category ?? ""} className="h-3.5 w-3.5" />
                  <span className="truncate">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        `link`, NOT `row`.

        `row` is the DANGER_ROW treatment, and ui-context scopes that explicitly:
        red is for "a bounded destructive section only ... a red row loose on a
        page is exactly the misuse that scoping exists to prevent". A permanent
        sidebar is about as loose as a page gets, and a standing red control in
        the corner of every screen is both an amber-rarity problem and a thing
        people learn to stop seeing.

        `link` is the quiet text treatment the phone's header used, which is
        precisely the control this sidebar inherited. Profile's danger zone still
        owns the red one.
      */}
      <div className="mt-auto flex border-t border-border-default px-2 pt-4">
        <SignOutConfirm variant="link" />
      </div>
    </aside>
  )
}
