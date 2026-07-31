"use client"

import { useCloudHydration } from "@/components/home/useCloudHydration"

/**
 * A mount point for {@link useCloudHydration} on screens whose own shell is a
 * SERVER component and so cannot call the hook themselves.
 *
 * Home and Protocol call the hook directly. Progress and Blocks did not call it
 * at all, which meant a device that had never opened either of those two read
 * the dose log straight out of an empty device store — and the block
 * retrospective does not degrade quietly when that happens, it states a measured
 * "0%" consistency for a block that has doses in it. Hydrating here makes every
 * screen that READS the device store also responsible for filling it.
 *
 * Renders nothing. The hook is idempotent (the migration is marker-guarded and
 * the pull reconciles rather than overwrites), so mounting it on more screens
 * costs one reconciliation on entry and nothing else.
 */
export function CloudHydration({ userId }: { userId: string }) {
  useCloudHydration(userId)
  return null
}
