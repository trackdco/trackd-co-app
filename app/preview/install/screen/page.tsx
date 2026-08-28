"use client";

import { notFound } from "next/navigation";

import { FlowContext, type FlowContextValue } from "@/components/onboarding/flow-context";
import { InstallScreen } from "@/components/onboarding/screens/install";

/**
 * The REAL install screen, outside the flow.
 *
 * `InstallScreen` is screen 13 of onboarding and needs a signed-in session to
 * reach normally, which makes its four states almost impossible to look at. It
 * only actually reads `finish` off the flow, so a stub context is enough to
 * render it truthfully — this is the shipped component, not a copy of it.
 *
 * To see the Android path, dispatch the event Chrome would:
 *
 *   const e = new Event("beforeinstallprompt");
 *   e.prompt = async () => {};
 *   e.userChoice = Promise.resolve({ outcome: "dismissed" });
 *   window.dispatchEvent(e);
 *
 * `usePwaInstall` captures it exactly as it captures Chrome's, so the one-tap
 * state that appears is the real one rather than a mock of it.
 */
const STUB = {
  finish: () => {},
  goNext: () => {},
  goBack: () => {},
  goTo: () => {},
  patch: () => {},
  setBackHandler: () => {},
  playHandoff: () => {},
  step: "install",
  accountName: null,
  session: {},
} as unknown as FlowContextValue;

export default function InstallScreenPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <FlowContext.Provider value={STUB}>
      <InstallScreen />
    </FlowContext.Provider>
  );
}
