import { DashboardLoading } from "@/components/feel/RouteSkeletons"

/**
 * Home's skeleton: the title, the week strip and the four cards, waving.
 *
 * A route with no `loading.tsx` keeps the old screen up until the server
 * answers, so a tab tap looked ignored. With one, Next prefetches this shell and
 * switches the moment the tab is tapped (feel pass §1).
 */
export default function Loading() {
  return <DashboardLoading />
}
