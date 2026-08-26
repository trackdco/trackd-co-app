"use client";

import type { StepId } from "@/lib/onboarding/steps";

import { AccountScreen } from "./screens/account";
import { AttributionScreen } from "./screens/attribution";
import { CelebrateScreen } from "./screens/celebrate";
import { CheckoutScreen } from "./screens/checkout";
import { CostScreen } from "./screens/cost";
import { DemoScreen } from "./screens/demo";
import { FreeScreen } from "./screens/free";
import { GreetingScreen } from "./screens/greeting";
import { HookScreen } from "./screens/hook";
import {
  BirthdayScreen,
  GenderScreen,
  NameScreen,
} from "./screens/housekeeping";
import { InstallScreen } from "./screens/install";
import { LetterScreen } from "./screens/letter";
import { NotificationsScreen } from "./screens/notifications";
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
  name: NameScreen,
  birthday: BirthdayScreen,
  gender: GenderScreen,
  greeting: GreetingScreen,
  running: RunningScreen,
  struggle: StruggleScreen,
  celebrate: CelebrateScreen,
  demo: DemoScreen,
  cost: CostScreen,
  free: FreeScreen,
  account: AccountScreen,
  // The step ids are `plans` / `start`; the screens keep their original names.
  // See `StepId` in `lib/onboarding/steps.ts` for why only the id moved.
  plans: PaywallScreen,
  start: CheckoutScreen,
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
