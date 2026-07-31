"use client";

import Image from "next/image";
import Link from "next/link";

import { FlowCta, FlowSub, FlowTitle } from "../chrome";
import { DeviceFrame } from "../device-frame";
import { NotesCompare } from "../notes-compare";
import { useFlow } from "../flow-context";

/**
 * Screen 0 — Hook (Spec 3-01 §9).
 *
 * The value prop, and the Notes-vs-Trackd contrast as the first thing the user
 * touches. No account, no wall, nothing asked for.
 *
 * The backdrop slot is deliberately empty: Adrian wants a gym-floor photo
 * behind this screen, settling out of a slight overscale on entry. Drop a file
 * at `public/onboarding/hook-backdrop.jpg` and set HOOK_BACKDROP to its path.
 * Until then the screen renders on the plain canvas, which is the safe default
 * rather than a broken image. The motion is a ONE-SHOT entrance, not an ambient
 * loop (see `.animate-flow-hero`).
 */
const HOOK_BACKDROP: string | null = null;

export function HookScreen() {
  const { goNext } = useFlow();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {HOOK_BACKDROP ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Image
            src={HOOK_BACKDROP}
            alt=""
            fill
            priority
            sizes="100vw"
            className="animate-flow-hero object-cover opacity-30"
          />
          {/* The canvas has to win under the type, or the headline sits on
              texture and stops being legible. */}
          <div className="absolute inset-0 bg-gradient-to-b from-bg-base/70 via-bg-base/85 to-bg-base" />
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pt-2">
        <header className="shrink-0 space-y-4 text-center">
          <Image
            src="/trackd-wordmark.png"
            alt="trackd co"
            width={1049}
            height={200}
            priority
            className="mx-auto h-3.5 w-auto"
          />

          <FlowTitle className="mx-auto max-w-[19rem]">
            Stop running your protocol out of a{" "}
            {/* The thing being replaced carries the weight of the sentence. */}
            <strong className="font-medium">Notes app</strong>.
          </FlowTitle>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-5">
          <DeviceFrame>
            <div className="px-2 pb-2">
              <NotesCompare />
            </div>
          </DeviceFrame>

          {/* The instruction belongs UNDER the thing it is about (Adrian,
              2026-08-01): above the phone it read as a subtitle to the
              headline rather than as a label for the control. */}
          <FlowSub className="text-center">Slide to see the difference.</FlowSub>
        </div>

        <footer className="shrink-0 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Continue</FlowCta>
          <p className="text-center text-[0.7rem] leading-relaxed text-text-subtle">
            Paid plan. 18+ only.{" "}
            <Link
              href="/terms"
              className="text-text-muted underline-offset-2 hover:text-foreground"
            >
              Terms
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
