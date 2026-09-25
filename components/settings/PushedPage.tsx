import { BackLink } from "@/components/feel/BackLink"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { RouteSkeleton } from "@/components/feel/Skeleton"
import { PAGE_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * The canonical scaffold of a page you push to (consistency fix #23; ui-context
 * → Layout). Notifications, Billing and Manage sit on it.
 */
export const PUSHED_PAGE = "relative mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"

/**
 * The head of a page pushed from Profile: the one way back at the TOP (the
 * arrow and the parent's name), then the title, then its line when it has one.
 * Never a typed "Back to …" at the foot. The page and its `loading.tsx` both
 * draw this, so the skeleton's title stands exactly where the page's will.
 */
export function PushedPageHead({
  back,
  title,
  subtitle,
}: {
  back: { href: string; label: string }
  title: string
  subtitle?: string
}) {
  return (
    <>
      <BackLink href={back.href} label={back.label} />
      <h1 className={cn(PAGE_TITLE, "mt-1")}>{title}</h1>
      {subtitle ? <p className="mt-2 text-sm leading-relaxed text-text-muted">{subtitle}</p> : null}
    </>
  )
}

/**
 * A pushed page's `loading.tsx`: its head, then blocks where its cards will
 * be, so the tap from Profile switches at once (feel pass §1). The back link
 * is live while it loads.
 */
export function PushedPageLoading({
  screen,
  back,
  title,
  subtitle,
  cards = 3,
}: {
  screen: string
  back: { href: string; label: string }
  title: string
  subtitle?: string
  cards?: number
}) {
  return (
    <div data-screen={screen} data-desktop-layout="column" className={PUSHED_PAGE}>
      <div className="animate-shortcut-fade">
        <PushedPageHead back={back} title={title} subtitle={subtitle} />
      </div>
      <RouteSkeleton id={screen} label={`Loading ${title.toLowerCase()}`} className="space-y-5">
        <ListBlocks cards={cards} />
      </RouteSkeleton>
    </div>
  )
}
