"use client"

import type { ReactNode } from "react"

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * THE ONE SHEET FRAME (consistency fix #1): a bottom sheet with a grab handle
 * you pull down to close, a hairline top, the surface, and no ×. Tapping the
 * dark above it and Escape close it too. Its header is one of two kinds:
 *
 * - a title (`SHEET_TITLE`) with a footer of Cancel + the primary action, or
 * - a Cancel / Title / Verb bar (Add, Log), passed as `header`.
 *
 * Content scrolls inside; the frame never grows past 92% of the screen. On a
 * desktop it is the dialog or the rail, as `desktop` says (app/desktop.css
 * hides the handle there).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  header,
  footer,
  desktop = "dialog",
  onOpenAutoFocus,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sheet's name; also its accessible name. */
  title: string
  /** Name it for screen readers only (a sheet whose content says what it is). */
  hideTitle?: boolean
  /** Read out with the title; never shown. */
  description?: string
  /** A Cancel / Title / Verb bar in place of the plain title. */
  header?: ReactNode
  /** Pinned under the scrolling content: Cancel + the primary action. */
  footer?: ReactNode
  desktop?: "dialog" | "rail"
  /** Focus on open. By default nothing is focused, so no keyboard springs up. */
  onOpenAutoFocus?: (e: Event) => void
  className?: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-desktop={desktop}
        side="bottom"
        showCloseButton={false}
        onOpenAutoFocus={onOpenAutoFocus}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <Frame
          open={open}
          onClose={() => onOpenChange(false)}
          title={title}
          hideTitle={hideTitle || header != null}
          description={description}
          header={header}
          footer={footer}
          className={className}
        >
          {children}
        </Frame>
      </SheetContent>
    </Sheet>
  )
}

function Frame({
  open,
  onClose,
  title,
  hideTitle,
  description,
  header,
  footer,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  hideTitle: boolean
  description?: string
  header?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(onClose, open)
  return (
    <div
      ref={cardRef}
      style={cardStyle}
      className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg"
    >
      {/* The grab handle: pull down to close. */}
      <div
        {...handleProps}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
      </div>
      <SheetTitle className={hideTitle ? "sr-only" : cn(SHEET_TITLE, "shrink-0 px-5 pb-3")}>{title}</SheetTitle>
      {description ? <SheetDescription className="sr-only">{description}</SheetDescription> : null}
      {header ? <div className="shrink-0 px-5 pb-3">{header}</div> : null}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5", footer ? "pb-3" : "pb-[calc(1.25rem+env(safe-area-inset-bottom))]", className)}>
        {children}
      </div>
      {footer ? (
        <div className="flex shrink-0 gap-2 px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>
      ) : null}
    </div>
  )
}
