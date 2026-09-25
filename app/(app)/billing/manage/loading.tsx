import { PushedPageLoading } from "@/components/settings/PushedPage"

/**
 * The Manage screen's own skeleton (feel pass §1). Without it, Billing's
 * `loading.tsx` covered this route too, so Manage opened on a "Billing" title.
 * Its head is the page's own: back to Billing, then the title.
 */
export default function Loading() {
  return (
    <PushedPageLoading
      screen="billing-manage"
      back={{ href: "/billing", label: "Billing" }}
      title="Manage"
    />
  )
}
