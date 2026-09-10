"use client"

import { useSyncExternalStore } from "react"

/**
 * WHERE THE PHONE STOPS AND THE LAPTOP STARTS — the single source of that
 * answer. `app/desktop.css` states the same query in CSS; this is the JS half,
 * and the two must never drift, which is why the string lives here once and the
 * CSS file names this module in its header.
 *
 * ## Room AND a pointer, not room alone
 *
 * The gate this replaced tested width only (`lg:`, 1024px), which is wrong in
 * the direction that matters: an iPad Pro in landscape is 1024-1366px CSS and is
 * a touch device being HELD. For it, the phone layout is not a fallback, it is
 * the better of the two designs — big targets, nav in thumb reach, sheets you
 * flick away. `pointer: fine` keeps it on that design and hands the desktop
 * shell to the things that actually have a cursor: laptops, desktops, and an
 * iPad the moment a trackpad is attached (iPadOS starts reporting `fine`).
 *
 * A touchscreen Windows laptop reports `fine` for its primary input and
 * correctly gets desktop. A phone in landscape never reaches 1024px.
 */
export const DESKTOP_QUERY = "(min-width: 1024px) and (pointer: fine)"

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener("change", callback)
  return () => mq.removeEventListener("change", callback)
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * FALSE on the server, always.
 *
 * There is no way to know a viewer's viewport or pointer while rendering on the
 * server, so the honest server answer is "assume the phone". Two things follow
 * and both are deliberate:
 *
 *  1. **Layout never waits for this hook.** The shell, the sidebar and the rail
 *     are placed by CSS (`app/desktop.css`), which the browser applies on the
 *     FIRST paint with no JavaScript involved. So a desktop viewer sees the
 *     desktop layout immediately; nothing flashes a phone layout first.
 *  2. **This hook is only for WORK, not for shape.** It gates the expensive
 *     client-side computation inside the rail so a phone does not subscribe to
 *     four stores and resolve a day's schedule for a column it will never show.
 *     Getting `false` for one frame on desktop costs a skeleton, never a jump.
 *
 * Using it to decide what to RENDER structurally would reintroduce the very
 * hydration flash the CSS approach exists to avoid. Don't.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
