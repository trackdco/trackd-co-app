"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  LineChart,
  Plus,
  Syringe,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ShortcutsMenu } from "@/components/shortcuts/ShortcutsMenu"

type Tab = {
  href: string
  label: string
  icon: LucideIcon
}

// Order, left → right: two tabs, [the plus], two tabs.
const LEFT_TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/protocol", label: "Protocol", icon: Syringe },
]

const RIGHT_TABS: Tab[] = [
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/profile", label: "Profile", icon: UserRound },
]

function isActive(pathname: string, href: string): boolean {
  // Home matches only its own route; the rest also match nested children so the
  // tab stays active on deeper screens added later.
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
 * scopes the user's "Make your own" compounds in local storage.
 */
export function BottomNav({ userId }: { userId: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  // Hide the bar while the on-screen keyboard is open: the visual viewport
  // shrinks well below the layout viewport when it appears. Gate on an actually
  // focused editable element too, so a non-keyboard viewport shrink (pinch-zoom,
  // split-screen) can't slide the nav off-screen. (No-op without a soft keyboard.)
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
      setKeyboardOpen(vv.height < window.innerHeight - 120 && editableFocused())
    }
    vv.addEventListener("resize", update)
    window.addEventListener("focusin", update)
    window.addEventListener("focusout", update)
    update()
    return () => {
      vv.removeEventListener("resize", update)
      window.removeEventListener("focusin", update)
      window.removeEventListener("focusout", update)
    }
  }, [])

  return (
    <>
      <nav
        aria-label="Primary"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-bg-surface transition-transform duration-200 ease-out",
          keyboardOpen && "translate-y-full"
        )}
        // Sit above the iPhone home indicator / Android gesture bar.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
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

      <ShortcutsMenu open={menuOpen} onOpenChange={setMenuOpen} userId={userId} />
    </>
  )
}
