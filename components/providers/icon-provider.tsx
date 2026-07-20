"use client";

import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Sets Phosphor's stroke weight once for the whole app (see
 * `Context/ui-context.md` → Icons). The **light** weight matches the Geist
 * weight-300 type so icons and typography read as one system; setting it
 * globally — never per-icon — means the stroke weight can never drift.
 */
export function IconProvider({ children }: { children: ReactNode }) {
  return (
    <IconContext.Provider value={{ weight: "light" }}>
      {children}
    </IconContext.Provider>
  );
}
