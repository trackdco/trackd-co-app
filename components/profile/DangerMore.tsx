"use client";

import { useState } from "react";
import { CaretDown } from "@/components/icons";

import { cn } from "@/lib/utils";

/**
 * The danger zone's second tier.
 *
 * Sign out sits in the open, because it is the one action here you might take
 * on a shared phone and it undoes itself the next time you log in. Everything
 * behind this row is irreversible, so it takes a deliberate tap to even see
 * (Adrian, 2026-07-30). Not a confirmation — each action keeps its own — just a
 * lid, so the destructive verb is not sitting under your thumb while you read
 * your own profile.
 *
 * Co-located with Profile rather than shared: it is this screen's danger zone,
 * not a pattern the app needs twice.
 */
export function DangerMore({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {open ? "Fewer options" : "More"}
        <CaretDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && <div className="hairline-t border-accent-destructive/40">{children}</div>}
    </>
  );
}
