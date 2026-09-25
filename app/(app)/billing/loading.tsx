import { PushedPageLoading } from "@/components/settings/PushedPage"

/**
 * The Billing screen's skeleton, so the tap from Profile switches at once
 * (feel pass §1). Its head is the page's own, the way back included.
 */
export default function Loading() {
  return (
    <PushedPageLoading
      screen="billing"
      back={{ href: "/profile", label: "Profile" }}
      title="Billing"
    />
  )
}
