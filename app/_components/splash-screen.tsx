"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Splash video overlay — Kyle the vial.
 *
 * Plays the splash clip full-screen on launch, lets Kyle ANIMATE, then crossfades
 * into the app (the same 500ms fade the shell uses). The fade is driven by the
 * clip itself — it fades a short, tunable PLAY_MS after the video actually starts
 * playing (so you always see Kyle move, but it never drags), or on the video's own
 * `ended`, whichever is first. It does NOT wait on `window.load` (which blocked on
 * the 1.1MB clip and stalled the splash ~5s).
 *
 * Robustness: if the clip never starts (autoplay blocked / asset not ready), a
 * no-start timer fades into the app rather than leaving the user on the static
 * poster; MAX_MS is an absolute backstop so the splash can never stick.
 *
 * Mounted once in the root layout, so it shows on a fresh load / PWA launch but not
 * on client-side navigations. Mobile only — desktop gets the interstitial instead.
 *
 * Why a still <img> UNDER the <video>: on an installed iOS PWA a <video> renders as
 * a BLACK box while it buffers and standalone WebKit often ignores `poster`, so we
 * paint the poster still (frame 0) immediately and keep the video at opacity 0
 * until it's actually playing (`onPlaying`), then reveal it. Frame 0 == poster ==
 * the native launch image, so the reveal is invisible and there's never a black
 * gap. If the video never plays, the still simply stays — never black.
 *
 * Offline: the clip + poster are precached by the service worker (public/sw.js),
 * so Kyle still plays with no connection.
 */
const SPLASH_SRC = "/trackd-kyle-vial-splashback.mp4";
// Frame 0 of the clip — also baked into the iOS launch images, so the native
// cold-launch screen, this poster, and the first played frame are identical.
const SPLASH_POSTER = "/trackd-kyle-vial-splash-poster.jpg";
// Kyle's size on the splash: the clip's display height as a fraction of the
// viewport (the rest is invisible black). The iOS launch PNGs are regenerated at
// this same fraction — keep them in sync if you tweak it.
const VIDEO_HEIGHT = "58%";
const FADE_MS = 500;
// How long Kyle animates after the clip starts playing, before the crossfade. Tune
// this for the splash length (we also fade on the clip's own `ended` if it's
// shorter). Kept short so it never feels like it "stays too long".
const PLAY_MS = 2800;
// If the clip hasn't started by here, it isn't going to (autoplay blocked / not
// ready) — fade in rather than strand the user on the static poster.
const NO_START_MS = 2200;
// Absolute backstop so a wedged splash can never stick.
const MAX_MS = 7000;

export function SplashScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const noStartRef = useRef<number | null>(null);
  const playCapRef = useRef<number | null>(null);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);
  // The video stays invisible (poster still showing through) until it actually
  // starts playing — see the component doc comment.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Respect reduced motion: skip the moving splash entirely. (Deferred a frame so
    // we're not setting state synchronously inside the effect body.)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(raf);
    }

    const video = videoRef.current;
    if (video) {
      // React can drop the `muted` attribute on hydration, which blocks autoplay —
      // set it on the element and nudge play() to be safe.
      video.muted = true;
      void video.play().catch(() => {});
    }

    // Backstops only. The happy path fades from onPlaying (PLAY_MS) / onEnded.
    noStartRef.current = window.setTimeout(() => setFading(true), NO_START_MS);
    const cap = window.setTimeout(() => setFading(true), MAX_MS);

    return () => {
      if (noStartRef.current) window.clearTimeout(noStartRef.current);
      if (playCapRef.current) window.clearTimeout(playCapRef.current);
      window.clearTimeout(cap);
    };
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden="true"
      onTransitionEnd={(e) => {
        // Only the overlay's OWN fade ends the splash — ignore the video reveal
        // transition bubbling up from the child.
        if (e.target === e.currentTarget && fading) setDone(true);
      }}
      className={`fixed inset-0 z-[9999] bg-black transition-opacity ease-out lg:hidden ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Kyle still (frame 0) — shown instantly so there's never a black gap. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- splash bridge, must paint before hydration with no layout pipeline */}
      <img
        src={SPLASH_POSTER}
        alt=""
        fetchPriority="high"
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-full -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{ height: VIDEO_HEIGHT }}
      />
      <video
        ref={videoRef}
        className={`pointer-events-none absolute left-1/2 top-1/2 max-w-full -translate-x-1/2 -translate-y-1/2 object-contain transition-opacity duration-300 ${
          revealed ? "opacity-100" : "opacity-0"
        }`}
        style={{ height: VIDEO_HEIGHT }}
        src={SPLASH_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        // The clip is actually rendering frames now: reveal it (over the identical
        // poster, so it's seamless), cancel the no-start fade, and let it animate
        // for PLAY_MS before the crossfade.
        onPlaying={() => {
          setRevealed(true);
          if (noStartRef.current) {
            window.clearTimeout(noStartRef.current);
            noStartRef.current = null;
          }
          if (playCapRef.current === null) {
            playCapRef.current = window.setTimeout(() => setFading(true), PLAY_MS);
          }
        }}
        // If the clip finishes before PLAY_MS, fade on its end rather than freezing
        // on the last frame.
        onEnded={() => setFading(true)}
      />
    </div>
  );
}
