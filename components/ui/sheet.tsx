"use client"

import * as React from "react"
import { X as XIcon } from "@/components/icons"
import * as SheetPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-overlay-backdrop data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "bottom",
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** `center` is a CENTRED dialog rather than an edge sheet — for a short
   *  confirmation that is not a form, where sliding up from the bottom reads as
   *  "here is more to do" (Adrian, 2026-08-07). */
  side?: "top" | "right" | "bottom" | "left" | "center"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      {/*
        ⚠️ PROTECTED FILE, EDITED WITH EXPLICIT AUTHORISATION (Adrian,
        2026-09-11: "all 40"). `ai-workflow-rules.md` protects components/ui/**;
        this is the one deliberate exception, and it is the timing only.

        THE MOTION WAS SHADCN'S, NOT OURS. This read `ease-in-out` with
        `duration-500` open and `duration-300` closed: the library's defaults,
        never chosen by anyone and not on the house scale (globals.css: 180 /
        240 / 320ms, house ease `cubic-bezier(0.16, 1, 0.3, 1)`). tw-animate-css
        builds every sheet's entrance from `--tw-duration` and `--tw-ease`, so
        every one of the app's forty sheets inherited it.

        `ease-in-out` over 500ms is the choppiness Adrian reported. It stalls,
        rushes, then crawls: 2.6% of the way up at 50ms, 61% at 200ms, then the
        last ~80px spread over a quarter of a second on a screen where the scrim
        and the menu have already finished. The house ease front-loads the
        movement instead, which is what makes a sheet feel like it arrived
        rather than like it is still arriving.

        Open is `--motion-slow` (320ms), close is `--motion-base` (240ms), both
        on the house ease, read from the tokens so a retune lands here too.
        Getting out of the way is quicker than arriving, same as the drop-up.

        The desktop rail and dialog override `animation` with literal values in
        desktop.css and are unaffected. Nothing in the app waits on these
        durations (checked: no timer or animationend is tied to a sheet), and
        both only got SHORTER, so no dependency could have been left late.
      */}
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // DEFAULT: don't move focus into the sheet on open. Radix otherwise focuses
        // the first field, which springs the mobile keyboard up unbidden the moment
        // a sheet appears (a recurring annoyance). Every sheet is keyboard-quiet by
        // default; a sheet that genuinely wants a field focused on open can pass its
        // own `onOpenAutoFocus` to override this.
        onOpenAutoFocus={onOpenAutoFocus ?? ((e) => e.preventDefault())}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-bg-surface shadow-lg transition ease-[var(--motion-ease)] outline-none data-[state=closed]:animate-out data-[state=closed]:duration-[var(--motion-base)] data-[state=open]:animate-in data-[state=open]:duration-[var(--motion-slow)]",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l border-border-default data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r border-border-default data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b border-border-default data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto rounded-t-3xl border-t border-border-default data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          side === "center" &&
            "top-1/2 left-1/2 h-auto w-[min(20rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-default data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-6", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-6", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-lg leading-none font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
