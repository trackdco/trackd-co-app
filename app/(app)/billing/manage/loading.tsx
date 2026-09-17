import { SettingsLoading } from "@/components/feel/RouteSkeletons"

/**
 * The Manage screen's own skeleton (feel pass §1). Without it, Billing's
 * `loading.tsx` covered this route too, so Manage opened on a "Billing" title.
 * Its first block is the summary card, 12px under the title.
 */
export default function Loading() {
  return <SettingsLoading screen="billing-manage" title="Manage" top="mt-3" />
}
