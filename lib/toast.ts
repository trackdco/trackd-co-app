/**
 * THE BOTTOM TOAST (build-brief-final §3.16): one short line at the foot of the
 * screen, above the + and the tab bar, with Undo wherever the action can be
 * undone ("Unticked", "Paused", "Mixed. Now in use.", "<Name> deleted").
 *
 * One at a time: a new toast replaces the last, and an Undo belongs only to the
 * toast that offered it, so a stale Undo can never reverse the wrong thing.
 * A tiny `useSyncExternalStore` store, the same shape as the app's other
 * in-memory stores, so any component can raise one without a provider.
 * Rendered once by the app shell (`components/feel/Toast.tsx`).
 *
 * Pure module state; no React here.
 */

export interface ToastState {
  /** Bumps on every show, so the same words twice still re-announce. */
  id: number
  text: string
  /** Present only when the action can be undone. */
  undo?: () => void
}

let current: ToastState | null = null
let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

/** How long a toast stays: 3s with an Undo (the brief's "Unticked" window), 2.2s without. */
export const TOAST_MS = { undo: 3000, plain: 2200 } as const

export function showToast(text: string, opts: { undo?: () => void; ms?: number } = {}): void {
  if (timer) clearTimeout(timer)
  current = { id: nextId++, text, ...(opts.undo ? { undo: opts.undo } : {}) }
  emit()
  const ms = opts.ms ?? (opts.undo ? TOAST_MS.undo : TOAST_MS.plain)
  timer = setTimeout(() => {
    current = null
    timer = null
    emit()
  }, ms)
}

export function dismissToast(): void {
  if (timer) clearTimeout(timer)
  timer = null
  current = null
  emit()
}

/** Run the toast's Undo once, then close it. */
export function undoToast(): void {
  const undo = current?.undo
  dismissToast()
  undo?.()
}

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToast(): ToastState | null {
  return current
}
