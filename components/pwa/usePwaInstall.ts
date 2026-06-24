"use client";

import { useSyncExternalStore } from "react";

/**
 * Android/Chrome native install. Chrome (and Samsung Internet) fire a
 * `beforeinstallprompt` event when the PWA is installable; we capture it and expose
 * a one-tap `promptInstall()` that opens the OS install dialog — no manual steps,
 * unlike iOS (which never fires this event, hence the Share-sheet instructions).
 *
 * Module-level capture (started at import, SSR-guarded) so an early event isn't
 * missed before a component mounts; `useSyncExternalStore` subscribes without any
 * setState-in-effect. `canInstall` is true only when Chrome has offered an install
 * AND the app isn't already installed (it clears on `appinstalled`).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
let listening = false;

function notify() {
  subscribers.forEach((fn) => fn());
}

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's own mini-infobar so we control when the prompt appears.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

// Attach as early as this client module loads so we don't miss an early event.
startListening();

function subscribe(cb: () => void) {
  startListening();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
const getSnapshot = () => deferredPrompt !== null;
const getServerSnapshot = () => false;

export function usePwaInstall() {
  const canInstall = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    // A prompt can only be used once; drop it either way.
    deferredPrompt = null;
    notify();
    return choice.outcome;
  }

  return { canInstall, promptInstall };
}
