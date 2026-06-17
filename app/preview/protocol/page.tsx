import { notFound } from "next/navigation"

import { ProtocolPreview } from "./preview"

/**
 * DEV-ONLY preview of the Protocol screen (Step 4) — the Plan / Stock toggle, the
 * active-cycle header ("Week X of N"), and the compound list — viewable WITHOUT
 * signing in or any Supabase env, with mock data. 404s in production. The real
 * screen is `/protocol` (behind auth); this is just to look at the UI.
 */
export default function PreviewProtocolPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ProtocolPreview />
}
