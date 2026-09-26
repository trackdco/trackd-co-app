import { notFound } from "next/navigation"

import { ProtocolPreview } from "./preview"

/**
 * DEV-ONLY preview of the Protocol screen: the compounds row with its stock
 * (two open vials and spares, a paused compound, a blend, none on hand), the
 * Schedule card and the Stacks, Cycles and Half-life buttons, viewable WITHOUT
 * signing in or any Supabase env, with mock data. 404s in production. The real
 * screen is `/protocol` (behind auth); this is just to look at the UI.
 */
export default function PreviewProtocolPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ProtocolPreview />
}
