"use client"

import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => {}

/**
 * True only once mounted on the client — `false` during SSR and the first
 * hydration render, then `true`. Uses `useSyncExternalStore` so there is no
 * setState-in-effect (and no hydration warning): the canonical client-only
 * gate for things that must not render on the server (e.g. a measured chart,
 * a value derived from the live clock).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}
