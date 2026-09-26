"use client"

import type { ReactNode } from "react"

import { BackLink } from "@/components/feel/BackLink"
import { SolidIcon } from "@/components/feel/SolidIcon"
import type { GlyphName } from "@/lib/solidGlyphs"
import { cn } from "@/lib/utils"
import {
  EXPLAINER_KEY,
  EXPLAINER_KEY_SHAPE,
  ExplainerButton,
  type ExplainerTopic,
} from "@/components/protocol/Explainer"
import { PAGE_ACTION, PAGE_TITLE, PRESS, TILE } from "@/lib/ui-presets"

/** The page action's plus, as the approved mock draws it (`r6/page.js`
 *  `PLUS`): 12px, a 1.3 stroke with round ends. The icon set's light plus is
 *  a hairline at this size. */
function PlusMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="block">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * A Protocol page's frame: the back link, the title with its explainer "?"
 * beside it (build-brief-final §3.8), and the page's one action at top right.
 * The page slides in from 26px to the right with a fade (300ms, §3.7).
 *
 * The action is a white button in words, "+ New stack" (`PAGE_ACTION`,
 * Adrian's ruling 1): the quick-actions "+" is on every page, and two bare
 * "+" buttons on one screen looked alike. While what it opened is up
 * (`action.open`), it slides down toward the sheet and fades, its plus
 * turning a quarter, and comes back up the same path when the sheet goes
 * (W21; `.page-action` in globals.css).
 */
export function SubpageShell({
  screen,
  title,
  backHref = "/protocol",
  backLabel = "Protocol",
  explainer,
  help,
  mark,
  action,
  children,
}: {
  screen: string
  title: string
  /** A mark before the title (a compound's half-life curve). */
  mark?: ReactNode
  /** A "?" beside the title that opens this page's own guide. */
  help?: { label: string; onClick: () => void }
  backHref?: string
  /** The page it goes back to ("Cycles" from Ended). */
  backLabel?: string
  /** The "What is a …?" pop-up beside the title. */
  explainer?: ExplainerTopic
  /**
   * The page's one action, at top right.
   * - `label`: its WORDS, drawn after the plus ("New stack" reads
   *   "+ New stack"). It was the aria-label of a bare "+"; the same string now
   *   shows, so every caller reads right without a change.
   * - `open`: true while the sheet or picker it opened is up, for the slide
   *   (W21). Optional: without it the button simply stays where it is.
   * - `disabled`: kept for older callers. Prefer a control that always works
   *   (ruling 10); a disabled one must say why somewhere on the page.
   */
  action?: { label: string; onClick: () => void; disabled?: boolean; open?: boolean }
  children: ReactNode
}) {
  return (
    <div
      data-screen={screen}
      data-desktop-layout="column"
      className="subpage-in mx-auto w-full max-w-md space-y-4 px-5 pt-4 pb-5"
    >
      <div>
        <BackLink href={backHref} label={backLabel} />
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {mark}
            <h1 className={cn(PAGE_TITLE, "truncate")}>{title}</h1>
            {/* Every "?" beside a title is the one key: drawn at 20, with its
                own 44-point reach on ::after (`EXPLAINER_KEY`). */}
            {explainer ? <ExplainerButton topic={explainer} /> : null}
            {help ? (
              <button
                type="button"
                onClick={help.onClick}
                aria-label={help.label}
                className={cn(PRESS.icon, EXPLAINER_KEY)}
                style={EXPLAINER_KEY_SHAPE}
              >
                ?
              </button>
            ) : null}
          </div>
          {action ? (
            // The wrapper carries the slide, so the button's own press
            // (scale and opacity) never fights it.
            <span className="page-action" data-open={action.open ? "true" : "false"}>
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={PAGE_ACTION}
              >
                <span aria-hidden className="page-action-plus">
                  <PlusMark />
                </span>
                {action.label}
              </button>
            </span>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Something that opens in place under what was tapped: its height eases open
 * (420ms) and shut (280ms). Closed, its controls are out of reach.
 *
 * What it holds fades in as it opens and out as it shuts (`.fold-body`), so
 * the first slivers of a height reveal (a panel's lit top edge, its dark ring,
 * a hairline) never show as a lone line while the fold is still a few pixels
 * tall (Adrian's walk, W33: "hide it until the fold is open").
 */
export function Fold({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className="fold" data-open={open ? "true" : "false"} inert={!open}>
      <div>
        <div className={cn("fold-body", className)}>{children}</div>
      </div>
    </div>
  )
}

export interface SquareAction {
  label: string
  icon: GlyphName
  onClick: () => void
  /** Red, icon and word: End, Delete. */
  destructive?: boolean
  disabled?: boolean
}

/**
 * The rounded-square buttons under an opened row or card (round three): a
 * Solid mark over its word, side by side and equal. A destructive one is red,
 * icon and word, and asks before it acts (the caller's ConfirmDialog).
 */
export function SquareActions({ actions, className }: { actions: SquareAction[]; className?: string }) {
  return (
    <div
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          className={cn(
            PRESS.button,
            TILE,
            "flex flex-col items-center gap-1.5 px-1 py-2.5 text-[12px] disabled:opacity-40",
            a.destructive ? "text-accent-destructive-on-surface" : "text-foreground",
          )}
        >
          <SolidIcon name={a.icon} size={17} {...(a.destructive ? { hue: "var(--accent-destructive-on-surface)" } : {})} />
          {a.label}
        </button>
      ))}
    </div>
  )
}
