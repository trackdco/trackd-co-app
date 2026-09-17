"use client"

import { useCallback, useRef, useState, type RefObject } from "react"

import type { NumberPadProps, PadField } from "@/components/feel/NumberPad"

/**
 * One Trackd pad over a form of several number fields (feel pass §3).
 *
 * The form keeps its own values and builds the field list in the order the
 * fields appear; this hook owns which one is being typed, remembers each
 * field's element (so focus can go back to it), and hands out the props:
 *
 *   const pad = usePadSession()
 *   <PadInput {...pad.bind("dose")} value={dose} label="Dose in mg" />
 *   <NumberPad {...pad.padProps(fields)} />
 *
 * A field that disappears while it is being typed (its section closed, the
 * stock type changed) closes the pad rather than leaving it pointed at nothing.
 */
export function usePadSession() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const anchorRef = useRef<HTMLElement | null>(null)
  const lastId = useRef<string | null>(null)

  const open = useCallback((id: string) => {
    lastId.current = id
    setActiveId(id)
  }, [])
  const close = useCallback(() => setActiveId(null), [])

  const bind = (id: string) => ({
    active: activeId === id,
    onOpen: () => open(id),
    inputRef: (el: HTMLButtonElement | null) => {
      if (el) {
        els.current.set(id, el)
        anchorRef.current = el
      } else {
        els.current.delete(id)
      }
    },
  })

  const padProps = (
    fields: PadField[],
  ): Pick<
    NumberPadProps,
    "active" | "fields" | "onActiveChange" | "onClose" | "anchorRef" | "returnFocus"
  > => {
    const index = activeId === null ? -1 : fields.findIndex((f) => f.id === activeId)
    if (activeId !== null && index < 0) setActiveId(null)
    return {
      active: index >= 0 ? index : null,
      fields,
      onActiveChange: (i) => {
        const id = fields[i]?.id
        if (id) open(id)
      },
      onClose: close,
      anchorRef: anchorRef as RefObject<HTMLElement | null>,
      returnFocus: () => (lastId.current ? (els.current.get(lastId.current) ?? null) : null),
    }
  }

  return { activeId, open, close, bind, padProps }
}
