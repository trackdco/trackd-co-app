"use client"

import { useMemo, useState, useSyncExternalStore } from "react"

import { Container } from "@/components/containers"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { StackEditSheet } from "@/components/protocol/StackEditSheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { Fold, SquareActions, SubpageShell } from "@/components/protocol/pages/Subpage"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { paletteColourVar } from "@/lib/palette"
import { showToast } from "@/lib/toast"
import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import {
  EMPTY_STACKS,
  activeStacks,
  currentMemberIds,
  deleteStack,
  getStacksSnapshot,
  nextStackName,
  restoreStack,
  stackedIds,
  subscribeStacks,
  upsertStack,
  type Stack,
} from "@/lib/home/stacks"
import {
  cadenceLabel,
  formatTimeLabel,
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_STACK: StackCompound[] = []

/** "A keeps running." / "A and B keep running." / "A, B and C keep running." */
function keepRunningLine(names: string[]): string {
  if (names.length === 0) return "Its compounds keep running."
  if (names.length === 1) return `${names[0]} keeps running.`
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} keep running.`
}

/**
 * Protocol → Stacks (build-brief-final §3.9). "Stacks ?" with the "+" (New
 * stack) at top right. One card per stack (U1): its members' containers in the
 * stack's colour, the name, the time and how many. A tap opens it onto each
 * member's dose and cadence, then Edit and Delete. Delete asks, then says
 * "<Name> deleted" with Undo, which puts the stack back exactly as it was.
 * Logging never happens here.
 */
export function StacksScreen({
  userId,
  backHref,
  previewCompounds,
  previewStacks,
}: {
  userId: string
  backHref?: string
  previewCompounds?: StackCompound[]
  previewStacks?: Stack[]
}) {
  useCloudHydration(userId)
  const { guard } = useWriteAccess()
  const liveCompounds = useSyncExternalStore(subscribeStack, () => getStackSnapshot(userId, EMPTY_STACK), () => EMPTY_STACK)
  const liveStacks = useSyncExternalStore(subscribeStacks, () => getStacksSnapshot(userId), () => EMPTY_STACKS)
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? liveCompounds
  const stacks = previewStacks ?? liveStacks
  // Wait for the data, as Protocol does: an empty device must not flash "No
  // stacks yet" before the first cloud pull (consistency fix #22).
  const known = previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"

  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])
  const byId = useMemo(() => new Map(active.map((c) => [c.id, c])), [active])
  // Only stacks that still group something this screen can draw.
  const listed = useMemo(
    () => activeStacks(stacks).filter((s) => currentMemberIds(s).some((id) => byId.has(id))),
    [stacks, byId],
  )

  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Stack | null>(null)
  const [creating, setCreating] = useState(false)
  const [asking, setAsking] = useState<Stack | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)
  const unavailable = useMemo(() => {
    const all = stackedIds(stacks)
    if (editing) for (const id of currentMemberIds(editing)) all.delete(id)
    return all
  }, [stacks, editing])

  const membersOf = (s: Stack) =>
    currentMemberIds(s)
      .map((id) => byId.get(id))
      .filter((c): c is StackCompound => Boolean(c))

  const remove = (s: Stack) => {
    // The stack as it was, for Undo: same id, spans and colour.
    const snapshot = s
    if (!deleteStack(userId, s.id)) {
      showToast("Couldn’t delete. Try again.")
      return
    }
    setOpenId(null)
    showToast(`${s.name} deleted`, {
      undo: () => {
        const back = restoreStack(userId, snapshot)
        if (back.ok || back.reason === "exists") return
        showToast(
          back.reason === "member-taken"
            ? "Couldn’t undo. A compound is in another stack now."
            : "Couldn’t undo. Try again.",
        )
      },
    })
  }

  return (
    <SubpageShell
      screen="protocol-stacks"
      title="Stacks"
      backHref={backHref}
      explainer="stacks"
      action={{ label: "New stack", onClick: () => guard(() => setCreating(true)), disabled: known && active.length === 0 }}
    >
      {!known ? (
        <SkeletonGroup label="Loading your stacks" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      ) : listed.length === 0 ? (
        <p className="animate-home-up px-1 text-sm text-text-muted">
          {active.length === 0 ? "Add a compound on Protocol first." : "No stacks yet."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {listed.map((s, i) => {
            const members = membersOf(s)
            const colour = paletteColourVar(s.colour)
            const times = new Set(members.map((m) => m.schedule.timeOfDay))
            const shared = times.size === 1 ? [...times][0] : null
            const open = openId === s.id
            const container = (m: StackCompound, size: number) => (
              <Container
                key={m.id}
                name={m.name}
                inventoryType={inventoryTypeForCompound(m.name, m.method, m.inventoryForm)}
                category={m.category}
                stackColour={colour}
                fill={0.62}
                size={size}
              />
            )
            return (
              <section
                key={s.id}
                className="animate-home-up inst-card px-4"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : s.id)}
                  aria-expanded={open}
                  className={cn(PRESS.row, "flex w-full items-center gap-3 py-3.5 text-left")}
                >
                  <span className="x-clus flex shrink-0 items-end">{members.map((m) => container(m, 30))}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-light text-foreground">{s.name}</span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {shared
                        ? `${formatTimeLabel(shared)} · ${members.length}`
                        : `${members.length} ${members.length === 1 ? "compound" : "compounds"}`}
                    </span>
                  </span>
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} />
                </button>
                <Fold open={open} className="pb-3.5">
                  {members.map((m) => (
                    <div key={m.id} className="hairline-t flex items-center gap-2.5 border-border-default py-2.5">
                      {container(m, 20)}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] text-foreground">{m.name}</span>
                        <span className="text-[11.5px] text-text-muted">{cadenceLabel(m.schedule.cadence)}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[12.5px] text-foreground">
                        {m.dose} {m.unit}
                      </span>
                    </div>
                  ))}
                  <SquareActions
                    className="pt-1.5"
                    actions={[
                      { label: "Edit", icon: "edit", onClick: () => guard(() => setEditing(s)) },
                      { label: "Delete", icon: "discard", destructive: true, onClick: () => guard(() => setAsking(s)) },
                    ]}
                  />
                </Fold>
              </section>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title="Delete this stack?"
        line={asking ? keepRunningLine(membersOf(asking).map((m) => m.name)) : undefined}
        confirmLabel="Delete stack"
        onConfirm={() => {
          if (asking) remove(asking)
        }}
      />

      <StackEditSheet
        open={creating || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
            setPendingMemberId(null)
          }
        }}
        stack={editing}
        compounds={active}
        unavailableIds={unavailable}
        onSave={(s) => {
          upsertStack(userId, s, Object.fromEntries(active.map((c) => [c.id, c.name])))
          setCreating(false)
          setEditing(null)
          showToast("Saved")
        }}
        fallbackName={nextStackName(stacks)}
        onAddCompound={() => setPickerOpen(true)}
        pendingMemberId={pendingMemberId}
      />
      <AddToStackMenu
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o)
          if (o) setPendingMemberId(null)
        }}
        userId={userId}
        onAdded={(saved) => setPendingMemberId(saved.id)}
      />
    </SubpageShell>
  )
}
