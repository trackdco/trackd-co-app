"use client";

import { useEffect, useState } from "react";

/**
 * Splash overlay — Kyle the vial (static).
 *
 * PRIORITY: the app and the static splash image load FIRST. We paint the poster
 * still at high fetch priority so the branded splash appears instantly, hold it
 * briefly, then crossfade into the app (the same 500ms fade the shell uses).
 *
 * The fade is driven by TIMERS: it fades HOLD_MS after mount, with an absolute
 * backstop so a wedged splash can never stick. It does NOT wait on `window.load`.
 *
 * The still <img> == the native launch image, so the handoff is seamless and
 * there's never a black gap.
 *
 * Mounted once in the root layout; mobile only (desktop gets the interstitial).
 * Offline: the poster is precached by the service worker (public/sw.js).
 */
const SPLASH_POSTER = "/trackd-kyle-vial-splash-poster.jpg";
const IMAGE_HEIGHT = "58%";
// The poster has a dark-but-not-black square baked into its 9:16 frame, so it
// shows a hard rectangular edge against the pure-black overlay. Feather it with a
// soft circular vignette centred on Kyle so the box dissolves into the background.
// `closest-side` ⇒ the radius is half the (portrait) element's width, so the fade
// lands around the square's left/right edges; Kyle + his shadow stay inside the
// opaque core and the square's corners fade fully to black. Tunable: raise the
// first stop to keep more of Kyle crisp, lower the second to fade harder.
const SPLASH_MASK =
  "radial-gradient(circle closest-side at 50% 50%, black 56%, transparent 90%)";
const FADE_MS = 500;
// How long the static splash holds before the crossfade into the app.
const HOLD_MS = 900;

export function SplashScreen() {
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Respect reduced motion: skip the splash entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(raf);
    }

    const hold = window.setTimeout(() => setFading(true), HOLD_MS);
    return () => window.clearTimeout(hold);
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden="true"
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && fading) setDone(true);
      }}
      className={`fixed inset-0 z-[9999] bg-bg-base transition-opacity ease-out lg:hidden ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Kyle still — shown instantly at high priority so there's never a black gap. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- splash bridge, must paint before hydration with no layout pipeline */}
      <img
        src={SPLASH_POSTER}
        alt=""
        fetchPriority="high"
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-full -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{
          height: IMAGE_HEIGHT,
          WebkitMaskImage: SPLASH_MASK,
          maskImage: SPLASH_MASK,
        }}
      />
    </div>
  );
}
