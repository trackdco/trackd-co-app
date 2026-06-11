"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  LineChart,
  Plus,
  Syringe,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ShortcutsMenu } from "@/components/shortcuts/ShortcutsMenu"
import type { WeightUnit } from "@/lib/weight"

type Tab = {
  href: string
  label: string
  icon: LucideIcon
}

// Order, left → right: two tabs, [the plus], two tabs.
const LEFT_TABS: Tab[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/protocol", label: "Protocol", icon: Syringe },
]

const RIGHT_TABS: Tab[] = [
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/profile", label: "Profile", icon: UserRound },
]

function isActive(pathname: string, href: string): boolean {
  // The Dashboard tab matches only its own route; the rest also match nested
  // children so the tab stays active on deeper screens added later.
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavTab({ href, label, icon: Icon, active }: Tab & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // Subtle gray → amber fade on selection (restrained, per ui-context).
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-1 transition-colors duration-300 ease-out",
        active ? "text-accent-amber" : "text-text-muted"
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </Link>
  )
}

/**
 * Persistent bottom navigation for the logged-in app shell. The centre plus is
 * exempt from the active/gray logic — it stays white and opens the Shortcuts
 * menu (from which "Add a compound" reaches the Add-to-Stack flow). `userId`
 * scopes the user's "Make your own" compounds in local storage; `unit` is the
 * user's weight unit, used by the menu's quick log-weight popup.
 */
export function BottomNav({
  userId,
  unit,
}: {
  userId: string
  unit: WeightUnit
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  // Installed iOS PWAs can report innerHeight short of the real screen on cold
  // launch, leaving an uncovered strip below the nav; `deficit` px fills it.
  const [deficit, setDeficit] = useState(0)
  // True only inside an installed iOS home-screen app (navigator.standalone).
  // The fill below is gated on this so it can never affect Safari or Android.
  const [iosStandalone, setIosStandalone] = useState(false)

  // One visual-viewport listener, two jobs:
  //  1) Hide the bar while the on-screen keyboard is open — the visual viewport
  //     shrinks well below the layout viewport. Gate on a focused editable too so
  //     a non-keyboard shrink (pinch-zoom, split-screen) can't slide it off.
  //  2) Measure the cold-launch viewport deficit. On a standalone iOS launch the
  //     web view reports innerHeight short of the real screen (measured: 812 vs
  //     874), so the `fixed bottom-0` nav floats ~62px above the home indicator
  //     until the first swipe forces a relayout — the black strip. screen.height
  //     knows the true size; the JSX fills that gap with a nav-coloured strip.
  //     Clamped 0..240 so a transient/keyboard reading can't run away.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const editableFocused = () => {
      const el = document.activeElement as HTMLElement | null
      return (
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
    }
    const update = () => {
      setIosStandalone(
        (window.navigator as unknown as { standalone?: boolean }).standalone === true,
      )
      setKeyboardOpen(vv.height < window.innerHeight - 120 && editableFocused())
      setDeficit(
        Math.max(0, Math.min(240, Math.round(window.screen.height - window.innerHeight))),
      )
    }
    update()
    // Re-measure as iOS finalises launch geometry (it otherwise only settles on
    // the first user scroll). `resize` covers keyboard / toolbar / rotate /
    // finalisation; we deliberately skip vv `scroll` so rubber-band overscroll
    // can't jiggle the bar.
    const raf = requestAnimationFrame(update)
    const settle = setTimeout(update, 400)
    vv.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    window.addEventListener("focusin", update)
    window.addEventListener("focusout", update)
    window.addEventListener("pageshow", update)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      vv.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      window.removeEventListener("focusin", update)
      window.removeEventListener("focusout", update)
      window.removeEventListener("pageshow", update)
    }
  }, [])

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-bg-surface transition-transform duration-200 ease-out"
        style={{
          // Sit above the iPhone home indicator / Android gesture bar.
          paddingBottom: "env(safe-area-inset-bottom)",
          // Slide fully out of view while the keyboard is open.
          transform: keyboardOpen ? "translateY(100%)" : undefined,
        }}
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {LEFT_TABS.map((tab) => (
            <NavTab key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
          ))}

          {/* Centre plus — always white, never part of the active/gray logic. */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Shortcuts"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className="flex h-14 w-14 -translate-y-2 items-center justify-center rounded-full bg-accent-primary text-bg-base shadow-lg transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            </button>
          </div>

          {RIGHT_TABS.map((tab) => (
            <NavTab key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
          ))}
        </div>
      </nav>

      {/* Cold-launch black-strip cover — installed iOS PWA only. When the web
          view reports a short viewport, this fills the uncovered strip below the
          nav with the nav colour so the bottom reads as one surface. It sits just
          below the layout-viewport bottom (translateY(100%)); if the web view
          can't render there it's simply invisible (a no-op, never a regression).
          Collapses to nothing once the viewport settles (deficit -> 0), and is
          hidden with the nav while the keyboard is open. */}
      {iosStandalone && !keyboardOpen && deficit > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-bg-surface"
          style={{ height: deficit, transform: "translateY(100%)" }}
        />
      ) : null}

      <ShortcutsMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        userId={userId}
        unit={unit}
      />
    </>
  )
}
