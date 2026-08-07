"use client";

import { useEffect, useState } from "react";

import { FLOW_DISPLAY } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { Mascot } from "./mascot";

/**
 * FOUR CANDIDATES for how the greeting screen arrives (Adrian, 2026-08-05).
 *
 * The greeting is the payoff for the three questions before it — it is the
 * first moment the flow uses something the user gave it — so it is worth more
 * than a fade. One of these ships and the rest are deleted with the harness at
 * `/onboarding/welcome-effects`.
 *
 * Every one is ONE-SHOT. `ui-context.md` bans ambient motion, and a greeting
 * still moving after you have read it is exactly that. Every one also collapses
 * cleanly under `prefers-reduced-motion`: the content is never carried BY the
 * animation, so switching motion off leaves a correct, static screen rather
 * than an empty one. That rule is why the typewriter below reveals with
 * `visibility` per character instead of appending characters — a screen reader,
 * and a reduced-motion user, get the whole name at once.
 */

/**
 * NO CONFETTI (Adrian, 2026-08-05). It was on the `assemble` option and he does
 * not want it. Removed rather than made subtler: confetti is a reward gesture,
 * and this screen is not rewarding an achievement — nobody has done anything
 * yet but type their name. `ui-context.md`'s restraint rule points the same way.
 * `lift` replaces it as the fourth option.
 */
export type WelcomeEffect = "bloom" | "typewriter" | "lift" | "assemble";

export const WELCOME_EFFECTS: { id: WelcomeEffect; name: string }[] = [
  { id: "assemble", name: "Assembles in sequence" },
  { id: "bloom", name: "Amber bloom behind Kyle" },
  { id: "typewriter", name: "The name types itself" },
  { id: "lift", name: "Kyle lifts in, headline settles" },
];

/** Milliseconds between characters when the name types itself. */
const TYPE_MS = 70;

export function WelcomeStage({
  effect,
  name,
  sub,
}: {
  effect: WelcomeEffect;
  name: string | null;
  sub: string;
}) {
  const greeting = name ? `Welcome, ${name}` : "Welcome";

  // `assemble` and `lift` both stagger; they differ in WHAT moves. Assemble
  // brings each block in on its own beat; lift moves Kyle alone and lets the
  // words settle under him.
  const staggered = effect === "assemble" || effect === "lift";

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-6">
      <div className="relative flex shrink-0 items-center justify-center">
        {/* THE BLOOM MOVED INTO `Mascot` (2026-08-05), so Kyle carries his own
            light on every screen he appears on rather than one screen being
            lit. The `bloom` option here is now a STRONGER one on top of the
            default, which is the only thing left for this harness to compare. */}
        {effect === "bloom" ? (
          <span
            aria-hidden
            className="animate-welcome-bloom pointer-events-none absolute h-64 w-64 rounded-full blur-2xl"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 34%, transparent), transparent 70%)",
            }}
          />
        ) : null}

        <Mascot
          pose="flex"
          size={260}
          className={cn(
            "relative shrink-0",
            effect === "assemble" && "animate-flow-in",
            effect === "lift" && "animate-welcome-lift",
          )}
        />
      </div>

      <div className="shrink-0 space-y-3 text-center">
        <h1
          className={cn(
            FLOW_DISPLAY,
            // A 40px headline carrying a user-supplied name. The flow clips
            // overflow, so without the wrap rule a long name is silently cut in
            // half on the one screen whose job is showing we know who they are.
            "text-balance [overflow-wrap:anywhere]",
            staggered && "animate-flow-in",
          )}
          style={staggered ? { animationDelay: "220ms" } : undefined}
        >
          {effect === "typewriter" ? <Typewriter text={greeting} /> : greeting}
        </h1>

        <p
          className={cn(
            "mx-auto max-w-[20rem] text-[0.95rem] leading-relaxed text-text-muted",
            staggered && "animate-flow-in",
          )}
          style={staggered ? { animationDelay: "420ms" } : undefined}
        >
          {sub}
        </p>
      </div>
    </div>
  );
}

/**
 * Reveals a string character by character WITHOUT changing what is in the DOM.
 *
 * Every character is rendered from the first frame and hidden with
 * `visibility`, so the accessible name of the heading is the whole greeting
 * immediately, the layout never reflows as it "types", and a reduced-motion
 * user simply sees the finished line. Appending to a string would have failed
 * all three.
 */
function Typewriter({ text }: { text: string }) {
  // Read ONCE in a lazy initialiser, not in an effect: eslint bans setState in
  // an effect body, and the answer cannot change usefully mid-animation anyway.
  // Same idiom as `app-carousel.tsx`.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  const [typed, setTyped] = useState(0);
  const shown = reduced ? text.length : typed;

  useEffect(() => {
    if (reduced) return;
    if (typed >= text.length) return;
    const id = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(id);
  }, [reduced, typed, text.length]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split("").map((char, i) => (
          <span
            key={i}
            style={{ visibility: i < shown ? "visible" : "hidden" }}
          >
            {char}
          </span>
        ))}
      </span>
    </>
  );
}
