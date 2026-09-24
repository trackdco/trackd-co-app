"use client"

import Link from "next/link"
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { ArrowLeft, Plus } from "@/components/icons"
import { UpArrowIcon } from "@/components/halflife/HalfLifeCards"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, PAGE_TITLE, PRESS } from "@/lib/ui-presets"

/**
 * The shared shape of Protocol's three pages, Stock, Stacks and Cycles (Adrian,
 * 2026-09-24): the existing "‹ Protocol" look-back link, then the page title, and
 * no header action. Rows open IN PLACE with the up arrow; a destructive action
 * turns into two pills, Cancel and a red one, with no sentence.
 */
export function SubpageShell({
  screen,
  title,
  backHref = "/protocol",
  children,
}: {
  screen: string
  title: string
  backHref?: string
  children: ReactNode
}) {
  return (
    <div
      data-screen={screen}
      data-desktop-layout="wide"
      className="mx-auto w-full max-w-md space-y-4 px-5 pt-4 pb-5"
    >
      <div className="animate-home-up">
        <Link
          href={backHref}
          className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Protocol
        </Link>
        <h1 className={cn(PAGE_TITLE, "mt-1")}>{title}</h1>
      </div>
      {children}
    </div>
  )
}

/** A card of rows, optionally headed ("No stock", "No cycle"). */
export function XList({
  label,
  children,
  delay = 0,
}: {
  label?: string
  children: ReactNode
  delay?: number
}) {
  return (
    <div
      className="flow-card animate-home-up rounded-2xl bg-bg-surface px-[15px] py-0.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      {label && <p className={cn(CARD_EYEBROW, "pt-3")}>{label}</p>}
      {children}
    </div>
  )
}

/**
 * Which row of a list is open, and the scroll that keeps an opened row in view
 * (the preview's `setRow`: after the body has grown, bring its bottom above the
 * tab bar, never pushing its top off the screen).
 */
export function useOpenRow() {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const toggle = useCallback((key: string | null) => {
    setOpenKey((cur) => (key === null || cur === key ? null : key))
    if (key === null) return
    window.setTimeout(() => {
      const el = rows.current.get(key)
      if (!el || el.dataset.open !== "true") return
      const r = el.getBoundingClientRect()
      const over = r.bottom - (window.innerHeight - 96)
      if (over > 0) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        window.scrollBy({ top: Math.min(over, r.top - 70), behavior: reduce ? "auto" : "smooth" })
      }
    }, 420)
  }, [])
  const ref = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(key, el)
      else rows.current.delete(key)
    },
    [],
  )
  return { openKey, toggle, ref }
}

/**
 * One row that opens in place. The header is the whole tap target; while open
 * the figure gives way to the spinning up arrow, and the other rows condense.
 */
export function XRow({
  rowKey,
  open,
  mini,
  onToggle,
  rowRef,
  icon,
  name,
  sub,
  fig,
  children,
}: {
  rowKey: string
  open: boolean
  mini: boolean
  onToggle: () => void
  rowRef: (el: HTMLElement | null) => void
  icon: ReactNode
  name: string
  sub?: ReactNode
  fig?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      ref={rowRef}
      className="xrow"
      data-row={rowKey}
      data-open={open ? "true" : "false"}
      data-mini={mini ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? `Close ${name}` : `Open ${name}`}
        className={cn(PRESS.row, "xrow-head flex w-full items-center gap-3 text-left")}
      >
        <span className="xrow-ic relative flex shrink-0 items-end">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] text-foreground">{name}</span>
          {sub && <span className="xrow-sub">{sub}</span>}
        </span>
        {fig && <span className="xrow-fig flex shrink-0 flex-col gap-0.5 text-right">{fig}</span>}
        <span
          aria-hidden
          className="xrow-up h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-surface-raised text-foreground"
        >
          <UpArrowIcon />
        </span>
      </button>
      {/* Closed, its controls are out of reach: hidden by height alone they
          could still be tabbed to and read out. */}
      <div className="xrow-body" inert={!open}>
        <div>
          <div className="xrow-pad flex flex-col gap-2.5 pt-0.5 pb-3.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** The mono sub-line under a row's name: "2 OPEN · 9 SPARE". */
export function XSub({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10.5px] tracking-[0.04em] text-text-muted uppercase">{children}</span>
}

/** The figure at a row's right: a mono number over a word, amber when low. */
export function XFig({ value, label, low }: { value: ReactNode; label: string; low?: boolean }) {
  return (
    <>
      <b className={cn("font-mono text-[17px] font-light tracking-[-0.01em]", low ? "text-accent-amber" : "text-foreground")}>
        {value}
      </b>
      <span className={cn("text-[11px]", low ? "text-accent-amber" : "text-text-muted")}>{label}</span>
    </>
  )
}

/** Two figure tiles side by side, tinted in the row's hue. They never wrap. */
export function FTiles({
  hue,
  tiles,
}: {
  hue: string
  tiles: { value: ReactNode; label: string; low?: boolean }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-[7px]" style={{ "--hue": hue } as CSSProperties}>
      {tiles.map((t) => (
        <div
          key={t.label}
          data-low={t.low ? "true" : "false"}
          className="x-ftile flex flex-col items-center gap-[3px] rounded-[14px] px-2 pt-3 pb-2.5"
        >
          <b className="font-mono text-[19px] font-light tracking-[-0.02em] whitespace-nowrap">{t.value}</b>
          <span className="text-[11px] text-text-muted">{t.label}</span>
        </div>
      ))}
    </div>
  )
}

/** A raised card of label / value rows (Pattern, Started). */
export function RCard({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="rounded-[14px] bg-bg-surface-raised px-3 py-0.5">
      {rows.map(([l, v], i) => (
        <div
          key={l}
          className={cn(
            "flex items-center justify-between gap-2.5 py-2.5 text-[13px]",
            i > 0 && "border-t-[0.5px] border-border-default",
          )}
        >
          <span className="text-text-muted">{l}</span>
          <span className="font-mono text-[12.5px] text-foreground">{v}</span>
        </div>
      ))}
    </div>
  )
}

export interface QAction {
  label: string
  onClick: () => void
  /** Confirms by turning the row of actions into Cancel and a red pill. */
  destructive?: boolean
  disabled?: boolean
}

/**
 * The quiet actions under an open row ("Add stock · Correct · Discard"). A
 * destructive one asks by turning the whole row into two pills, Cancel and a
 * red Discard / Remove, with no sentence.
 */
export function QButtons({ actions }: { actions: QAction[] }) {
  const [confirming, setConfirming] = useState<QAction | null>(null)
  if (confirming) {
    return (
      <div className="animate-hl-swap flex justify-center gap-2.5">
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className={cn(PRESS.pill, "rounded-full border border-border-strong px-4 py-[7px] text-[12.5px] text-foreground")}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const a = confirming
            setConfirming(null)
            a.onClick()
          }}
          className={cn(PRESS.pill, "rounded-full border border-state-error bg-state-error px-4 py-[7px] text-[12.5px] font-medium text-foreground")}
        >
          {confirming.label}
        </button>
      </div>
    )
  }
  return (
    <div className="flex justify-center gap-[18px]">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled={a.disabled}
          onClick={() => (a.destructive ? setConfirming(a) : a.onClick())}
          className={cn(PRESS.text, "px-0.5 py-1 text-[12.5px] text-text-muted transition-colors hover:text-foreground disabled:opacity-40")}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

/** The white pill that starts a spare: "Mix one", "Open one". */
export function WhitePill({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        PRESS.button,
        "self-center rounded-full bg-accent-primary px-5 py-[9px] text-[13px] font-medium text-bg-base disabled:opacity-50",
      )}
    >
      {children}
    </button>
  )
}

/** The small round + at the end of a "No stock" / "No cycle" row. */
export function PlusButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(PRESS.icon, "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-bg-surface-raised text-foreground")}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}

/** A plain row in a "No stock" / "No cycle" card. */
export function PlainRow({
  icon,
  name,
  sub,
  right,
}: {
  icon: ReactNode
  name: string
  sub?: ReactNode
  right: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-t-[0.5px] border-border-default py-[11px] first:border-t-0 [p+&]:border-t-0">
      <span className="flex shrink-0 items-end">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] text-foreground">{name}</span>
        {sub}
      </span>
      {right}
    </div>
  )
}

/** "New stack": the hairline card at the foot of a page. */
export function NewCard({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        PRESS.card,
        "animate-home-up flex w-full items-center justify-center gap-2 rounded-2xl border-[0.5px] border-border-strong p-[18px] text-[13.5px] text-text-muted transition-colors hover:text-foreground disabled:opacity-50",
      )}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  )
}
