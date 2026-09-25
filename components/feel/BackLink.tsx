import Link from "next/link"

import { ArrowLeft } from "@/components/icons"

/**
 * THE ONE WAY BACK (consistency fix #23): at the top of every page you push
 * to, the arrow and the parent's name ("Protocol", "Progress", "Profile"),
 * with a 44px target. Never a typed "Back to …" at the foot of a page.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-muted transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  )
}
