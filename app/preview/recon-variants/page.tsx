import { notFound } from "next/navigation"

import { Switcher } from "./Switcher"

/**
 * DEV-ONLY harness for choosing a spec 07 layout. 404 in production, no auth, so
 * it opens on a phone over the LAN (`next dev -H 0.0.0.0`, then the Mac's
 * address). Delete this folder once a direction is picked.
 */
export default function ReconVariantsPage() {
  if (process.env.NODE_ENV === "production") notFound()

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-5 pt-4 pb-5">
      <span className="inline-block rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
        Preview · calculator layouts
      </span>
      <h1 className="font-sans text-4xl font-light tracking-tight text-foreground">
        Calculator
      </h1>
      <Switcher />
    </div>
  )
}
