"use client";

import { FlowCta, StepFrame } from "../chrome";
import { Confetti } from "../confetti";
import { useFlow } from "../flow-context";
import { Mascot } from "../mascot";

/**
 * Screen 4 — Celebrate (Spec 3-01 §9).
 *
 * The handover into the demo. Mascot plus a single amber burst, then straight
 * into the thing the whole flow exists to deliver. The copy makes the "no
 * account needed yet" promise explicit, because that is the reason a user keeps
 * going rather than bouncing at a wall.
 */
export function CelebrateScreen() {
  const { goNext } = useFlow();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      <StepFrame
        center
        title="Trackd's built for exactly this."
        sub="Have a look. No account needed."
        footer={<FlowCta onClick={goNext}>Try it now</FlowCta>}
      >
        <div className="flex items-center justify-center">
          <Mascot pose="flex" size={210} />
        </div>
      </StepFrame>
    </div>
  );
}
