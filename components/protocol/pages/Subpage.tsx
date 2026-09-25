"use client"

import type { ReactNode } from "react"

import { Plus } from "@/components/icons"
import { BackLink } from "@/components/feel/BackLink"
import { SolidIcon } from "@/components/feel/SolidIcon"
import type { GlyphName } from "@/lib/solidGlyphs"
import { cn } from "@/lib/utils"
import { ExplainerButton, type ExplainerTopic } from "@/components/protocol/Explainer"
import { ADD_ACTION, PAGE_TITLE, PRESS, TILE } from "@/lib/ui-presets"

/**
 * A Protocol page's frame: the back link, the title with its explainer "?"
 * beside it (build-brief-final §3.8), and the page's one action as a "+" at top
 * right (New stack, New cycle; round three). The page slides in from 26px to
 * the right with a fade (300ms, §3.7).
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
  /** The page's one action, as a "+" at top right. */
  action?: { label: string; onClick: () => void; disabled?: boolean }
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
            {explainer ? <ExplainerButton topic={explainer} /> : null}
            {help ? (
              <button
                type="button"
                onClick={help.onClick}
                aria-label={help.label}
                className={cn(
                  PRESS.icon,
                  "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-text-muted shadow-[inset_0_0_0_1.2px_var(--text-muted)] transition-colors hover:text-foreground",
                )}
              >
                ?
              </button>
            ) : null}
          </div>
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              className={cn(ADD_ACTION, "disabled:opacity-40")}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

/** Something that opens in place under what was tapped: its height eases open
 *  (420ms) and shut (280ms). Closed, its controls are out of reach. */
export function Fold({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className="fold" data-open={open ? "true" : "false"} inert={!open}>
      <div>
        <div className={className}>{children}</div>
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
