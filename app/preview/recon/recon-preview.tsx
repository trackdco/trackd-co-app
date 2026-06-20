"use client";

import { useState } from "react";

import { ReconCalculatorSheet } from "@/components/home/ReconCalculatorSheet";

/** Client harness: opens the real reconstitution calculator sheet so the new
 *  persistent warning copy + the step-by-step working can be reviewed. */
export function ReconPreview() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-border-default bg-bg-surface-raised px-4 py-2.5 text-sm font-medium text-foreground"
      >
        Open reconstitution calculator
      </button>
      <ReconCalculatorSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
