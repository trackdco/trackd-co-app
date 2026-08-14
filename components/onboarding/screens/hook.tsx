"use client";

import Image from "next/image";
import Link from "next/link";

import { Check, X } from "@/components/icons";
import { cn } from "@/lib/utils";

import { FlowCta, FlowSub, FlowTitle, ScrollPort } from "../chrome";
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

/**
 * One of the two cards floating off the phone's corners.
 *
 * Three points each, in opposing pairs, so the two cards read as one sentence
 * rather than as two lists. The ticks are FOREGROUND white and the crosses are
 * subtle, which is the contrast doing the work: amber stays on the slider
 * handle, the one live control on the screen, per the one-or-two-beats rule.
 */
function PointCard({
  title,
  tone,
  points,
  className,
  delay,
}: {
  title: string;
  tone: "good" | "bad";
  points: string[];
  className?: string;
  delay: number;
}) {
  const Mark = tone === "good" ? Check : X;
  return (
    <div
      aria-hidden
      className={cn(
        "animate-flow-in pointer-events-none absolute z-20 w-[7.5rem] rounded-2xl px-2.5 py-2",
        "flow-card bg-bg-surface/95 backdrop-blur-sm",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[9px] font-sans uppercase tracking-[0.18em] text-text-muted">
        {title}
      </p>
      <ul className="mt-1 space-y-0.5">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <Mark
              className={cn(
                "h-3 w-3 shrink-0",
                tone === "good" ? "text-foreground" : "text-text-subtle",
              )}
              weight="bold"
            />
            <span
              className={cn(
                "text-[11px] leading-tight",
                tone === "good" ? "text-foreground" : "text-text-muted",
              )}
            >
              {p}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

        <ScrollPort>
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 py-5">
          {/* The phone, with a card floating off each of two opposite corners
              (Adrian, 2026-08-01). They sit on the side they describe, which is
              the whole reason those two corners: Notes is the left panel of the
              wipe and Trackd is the right, so bottom-LEFT and top-RIGHT read as
              labels for the halves rather than as decoration.

              `pointer-events-none` throughout: they overhang the phone, and a
              decorative layer that swallows a drag on the slider underneath it
              would break the one control on the screen. */}
          {/* THE PHONE TAKES THE SPACE (Adrian, 2026-08-14: "the full size
              phone ... I don't want it to be the small thing").

              It was `max-w-[17rem]` and as tall as its contents, which left the
              hero of the screen occupying about a third of the height with dead
              air above and below it. It is HEIGHT-driven now: the frame is told
              `h-full w-auto`, takes whatever the headline and the CTA leave, and
              derives its width from the 390/844 ratio. On a short viewport it
              shrinks instead of pushing the CTA off the fold. */}
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            {/* Height in, width out. This box takes the leftover vertical space
                and derives its own width from the phone's ratio, which gives the
                floating cards a box the exact size of the phone to hang off —
                anchor them to the full-width row instead and they drift to the
                edges of the screen. */}
            <div className="relative aspect-[390/844] h-full max-w-[19rem]">
              {/* A pool of light for the phone to stand in. The canvas is one
                  flat near-black and the device is another, so however well the
                  bezel is lit the whole thing still reads as printed ON the
                  page rather than sitting in front of it. This is the cheapest
                  possible depth cue: one soft neutral radial, scaled past the
                  phone's own edges, under everything.

                  NEUTRAL, not amber, and that is the rule not a preference —
                  `ui-context.md` reserves amber for the single active moment on
                  screen, which here is the slider handle. A warm glow behind the
                  hero would be the second amber beat and would take the eye off
                  the one control the screen actually wants pressed. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-12 -inset-y-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(255_255_255/0.055),transparent_70%)]"
              />
              <DeviceFrame className="h-full w-full max-w-none">
                <NotesCompare />
              </DeviceFrame>

              {/* THEY HANG OFF THE EDGES, they do not sit on the glass. At the
                  old phone size a 20px overhang put them beside the device; now
                  the phone is height-driven and only ~177px wide in a 390px
                  viewport, the same offset parked them squarely over the
                  content they were meant to be annotating. Pulled out to 5rem so
                  two-thirds of each card is off the phone, and moved clear of
                  the seam handle in the middle. */}
              <PointCard
                title="Trackd"
                tone="good"
                points={["Counted for you", "Dated", "One tap"]}
                className="-right-[5rem] top-[10%]"
                delay={260}
              />
              <PointCard
                title="Notes app"
                tone="bad"
                points={["You do the maths", "?? or tues", "Forgot to log"]}
                className="-left-[5rem] bottom-[14%]"
                delay={420}
              />
            </div>
          </div>

          {/* The instruction belongs UNDER the thing it is about (Adrian,
              2026-08-01): above the phone it read as a subtitle to the
              headline rather than as a label for the control. */}
          <FlowSub className="shrink-0 text-center">Slide to see the difference.</FlowSub>
          </div>
        </ScrollPort>

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
