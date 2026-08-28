"use client";

import { notFound } from "next/navigation";
import { useState } from "react";

import { InstallWalkthrough } from "@/components/onboarding/install-walkthrough";
import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import type { DeviceGuess } from "@/lib/onboarding/platform";
import { cn } from "@/lib/utils";

/**
 * The install walkthrough, every device combination on one page.
 *
 * The real screen guesses the device from the user agent, so on any one machine
 * you can only ever see one of the four sets. This forces each of them, which
 * is the only practical way to check that a caption still matches the frame it
 * sits under after the drawings are re-rendered.
 */
const CASES: { label: string; device: DeviceGuess }[] = [
  { label: "iPhone · Safari", device: { platform: "ios", browser: "safari" } },
  { label: "Android · Chrome", device: { platform: "android", browser: "chrome" } },
  { label: "Android · Samsung", device: { platform: "android", browser: "samsung" } },
  { label: "Android · Firefox", device: { platform: "android", browser: "firefox" } },
  // No walkthrough exists here on purpose: the install is impossible outside
  // Safari on iOS, so the screen tells them to switch rather than drawing a
  // Share sheet they do not have. This case must render nothing.
  { label: "iPhone · Chrome (none)", device: { platform: "ios", browser: "chrome" } },
];

export default function WalkthroughPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const [at, setAt] = useState(0);
  const c = CASES[at];
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[26rem] px-5 py-6">
      <div className="mb-5 flex flex-wrap gap-1.5">
        {CASES.map((k, i) => (
          <button
            key={k.label}
            type="button"
            onClick={() => setAt(i)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[0.78rem]",
              i === at
                ? "bg-accent-amber text-bg-base"
                : "bg-bg-surface text-text-muted",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[0.8rem] text-text-subtle">
        {c.label}. Drag the row sideways, or tap a dot.
      </p>
      <InstallWalkthrough device={c.device} />

      {/* The other place these steps appear: after somebody has been sent out of
          Chrome, got themselves into Safari and signed in again. Same component,
          wrapped in the sheet the dashboard popup and the Profile row use. */}
      <p className="mt-10 mb-3 text-[0.8rem] text-text-subtle">
        And the same steps as the Safari landing sees them, via
        AddToHomeScreenPrompt:
      </p>
      <AddToHomeScreenPrompt />
    </div>
  );
}
