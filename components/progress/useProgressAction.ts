"use client";

import { useEffect, useRef } from "react";

import {
  clearProgressAction,
  peekProgressAction,
  subscribeProgressAction,
  type ProgressAction,
} from "@/lib/progress/progressAction";

/**
 * Run `onFire` each time the global "+" menu requests `action` for the Progress
 * screen (see `lib/progress/progressAction`). The handler reads the pending
 * signal directly — once on mount (to catch a request made BEFORE this mounted,
 * the cross-tab navigation case) and on every later notification (already on
 * /progress) — then clears it so it fires exactly once per request. `onFire` is
 * held in a ref so the subscription stays stable.
 */
export function useProgressAction(action: ProgressAction, onFire: () => void): void {
  const fireRef = useRef(onFire);
  useEffect(() => {
    fireRef.current = onFire;
  });

  useEffect(() => {
    const handle = () => {
      const signal = peekProgressAction();
      if (signal && signal.action === action) {
        clearProgressAction(signal.id);
        fireRef.current();
      }
    };
    handle(); // catch a request made before this subscribed
    return subscribeProgressAction(handle);
  }, [action]);
}
