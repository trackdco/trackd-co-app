import { WeightLoading } from "@/components/feel/RouteSkeletons"

/**
 * The Weight screen's skeleton: the log card and a ghost graph.
 *
 * A route with no `loading.tsx` keeps the old screen up until the server
 * answers, so a tab tap looked ignored. With one, Next prefetches this shell and
 * switches the moment the tab is tapped (feel pass §1).
 */
export default function Loading() {
  return <WeightLoading />
}
