"use client";

import type { StepId } from "@/lib/onboarding/steps";

import { AttributionScreen } from "./screens/attribution";
import { CelebrateScreen } from "./screens/celebrate";
import { DemoHistoryScreen } from "./screens/demo-history";
import { DemoLogScreen } from "./screens/demo-log";
import { DemoSiteScreen } from "./screens/demo-site";
import { DemoStockScreen } from "./screens/demo-stock";
import { HookScreen } from "./screens/hook";
import { HousekeepingScreen } from "./screens/housekeeping";
import { InstallScreen } from "./screens/install";
import { LetterScreen } from "./screens/letter";
import { NotificationsScreen } from "./screens/notifications";
import { PayoffScreen } from "./screens/payoff";
import { PaywallScreen } from "./screens/paywall";
import { RunningScreen, StruggleScreen } from "./screens/intent";
import { WelcomeScreen } from "./screens/welcome";

/**
 * One step id to one screen. A `Record` rather than a switch, so TypeScript
 * fails the build if a step is added to `STEP_ORDER` without a screen behind
 * it (an exhaustive map cannot be partially filled).
 */
const SCREENS: Record<StepId, () => React.ReactElement> = {
  hook: HookScreen,
  housekeeping: HousekeepingScreen,
  running: RunningScreen,
  struggle: StruggleScreen,
  celebrate: CelebrateScreen,
  demoLog: DemoLogScreen,
  demoStock: DemoStockScreen,
  demoSite: DemoSiteScreen,
  demoHistory: DemoHistoryScreen,
  payoff: PayoffScreen,
  paywall: PaywallScreen,
  welcome: WelcomeScreen,
  install: InstallScreen,
  notifications: NotificationsScreen,
  attribution: AttributionScreen,
  letter: LetterScreen,
};

export function StepRenderer({ step }: { step: StepId }) {
  const Screen = SCREENS[step];
  return <Screen />;
}
