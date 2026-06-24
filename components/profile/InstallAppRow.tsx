"use client";

import { useState } from "react";
import { ChevronRight, Smartphone } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";

/**
 * Profile → App row that re-opens the "Add to Home Screen" instructions on demand
 * — the permanent home for the same visuals shown in the one-time signup popup
 * (components/pwa/InstallHomeScreenPopup). Styled to match the section's LinkRows
 * but it's a button (opens a sheet rather than navigating). Reuses the shared
 * AddToHomeScreenPrompt so the copy stays in one place.
 */
export function InstallAppRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <Smartphone className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <span className="flex-1 text-sm text-foreground">Add to Home Screen</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-3xl border-border-default bg-bg-surface px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        >
          <SheetTitle className="sr-only">Add Trackd to your Home Screen</SheetTitle>
          <SheetDescription className="sr-only">
            How to install Trackd as an app on your iPhone Home Screen.
          </SheetDescription>
          <AddToHomeScreenPrompt />
        </SheetContent>
      </Sheet>
    </>
  );
}
