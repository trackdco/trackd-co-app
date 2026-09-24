"use client"

import { useMemo, useState, useSyncExternalStore } from "react"

import { Container } from "@/components/containers"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { StackEditSheet } from "@/components/protocol/StackEditSheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import {
  NewCard,
  QButtons,
  SubpageShell,
  XList,
  XRow,
  XSub,
  useOpenRow,
} from "@/components/protocol/pages/Subpage"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { paletteColourVar } from "@/lib/palette"
import {
  EMPTY_STACKS,
  activeStacks,
  currentMemberIds,
  deleteStack,
  getStacksSnapshot,
  nextStackName,
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

/**
 * Protocol → Stacks (Adrian, 2026-09-24). Each row shows its members' vials in
 * the STACK's colour, the name, how many and when, and the colour dot; it opens
 * in place onto each member's dose and cadence, and Edit. "New stack" is the
 * hairline card at the foot. Logging never happens here.
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
  const liveCompounds = useSyncExternalStore(subscribeStack, () => getStackSnapshot(userId, EMPTY_STACK), () => EMPTY_STACK)
  const liveStacks = useSyncExternalStore(subscribeStacks, () => getStacksSnapshot(userId), () => EMPTY_STACKS)
  const compounds = previewCompounds ?? liveCompounds
  const stacks = previewStacks ?? liveStacks

  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])
  const byId = useMemo(() => new Map(active.map((c) => [c.id, c])), [active])
  // Only stacks that still group something this screen can draw.
  const listed = useMemo(
    () => activeStacks(stacks).filter((s) => currentMemberIds(s).some((id) => byId.has(id))),
    [stacks, byId],
  )

  const [editing, setEditing] = useState<Stack | null>(null)
  const [creating, setCreating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)
  const unavailable = useMemo(() => {
    const all = stackedIds(stacks)
    if (editing) for (const id of currentMemberIds(editing)) all.delete(id)
    return all
  }, [stacks, editing])
  const rows = useOpenRow()

  return (
    <SubpageShell screen="protocol-stacks" title="Stacks" backHref={backHref}>
      {listed.length > 0 && (
        <XList>
          {listed.map((s) => {
            const members = currentMemberIds(s)
              .map((id) => byId.get(id))
              .filter((c): c is StackCompound => Boolean(c))
            const colour = paletteColourVar(s.colour)
            const times = new Set(members.map((m) => m.schedule.timeOfDay))
            const shared = times.size === 1 ? [...times][0] : null
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
              <XRow
                key={s.id}
                rowKey={s.id}
                open={rows.openKey === s.id}
                mini={rows.openKey !== null && rows.openKey !== s.id}
                onToggle={() => rows.toggle(s.id)}
                rowRef={rows.ref(s.id)}
                icon={<span className="x-clus flex">{members.map((m) => container(m, 30))}</span>}
                name={s.name}
                sub={
                  <XSub>
                    {shared
                      ? `${members.length} · ${formatTimeLabel(shared)}`
                      : `${members.length} ${members.length === 1 ? "compound" : "compounds"}`}
                  </XSub>
                }
                fig={<span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colour }} />}
              >
                <div>
                  {members.map((m, i) => (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2.5 py-[9px] text-[13.5px] ${i > 0 ? "border-t-[0.5px] border-border-default" : ""}`}
                    >
                      {container(m, 22)}
                      <span className="min-w-0 truncate text-foreground">{m.name}</span>
                      <span className="ml-auto font-mono text-xs text-foreground">
                        {m.dose} {m.unit}
                      </span>
                      <span className="min-w-16 text-right text-[11.5px] text-text-muted">{cadenceLabel(m.schedule.cadence)}</span>
                    </div>
                  ))}
                </div>
                <QButtons actions={[{ label: "Edit", onClick: () => setEditing(s) }]} />
              </XRow>
            )
          })}
        </XList>
      )}
      {listed.length === 0 && (
        <p className="animate-home-up px-1 text-sm text-text-muted">Compounds you take together, logged in one tap.</p>
      )}
      <NewCard label="New stack" onClick={() => setCreating(true)} disabled={active.length === 0} />

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
        }}
        fallbackName={nextStackName(stacks)}
        onAddCompound={() => setPickerOpen(true)}
        pendingMemberId={pendingMemberId}
        onDelete={
          editing
            ? () => {
                deleteStack(userId, editing.id)
                setEditing(null)
              }
            : undefined
        }
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
