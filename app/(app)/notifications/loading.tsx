import { PushedPageLoading } from "@/components/settings/PushedPage"

/**
 * The Notifications screen's skeleton, so the tap from Profile switches at once
 * (feel pass §1). Its head is the page's own, the way back included.
 */
export default function Loading() {
  return (
    <PushedPageLoading
      screen="notifications"
      back={{ href: "/profile", label: "Profile" }}
      title="Notifications"
      subtitle="Reminders for your protocol, sent to this device."
      // The preview and the one settings card.
      cards={2}
    />
  )
}
