"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Splash video overlay — Kyle the vial.
 *
 * Plays the splash clip full-screen the moment the app loads, then fades into
 * the app (same 500ms fade the shell already uses) after a short hold
 * (HOLD_MS). It deliberately does NOT wait for `window.load` — that waited on
 * the 1.1MB clip itself and stalled the splash on screen for ~5s. The app shell
 * is already mounted underneath, so the fade reveals a ready screen.
 *
 * Offline: the clip + poster are precached by the service worker (public/sw.js),
 * so Kyle still plays with no connection. If the video can't load at all, the
 * poster still (== the native iOS launch image) stays — never a black screen.
 *
 * Mounted once in the root layout, so it shows on a fresh load / PWA launch but
 * not on client-side navigations (the root layout island stays mounted across
 * App Router navs). Mobile only — desktop gets the interstitial instead.
 *
 * The clip is centered at VIDEO_HEIGHT of the viewport on pure black, so Kyle
 * reads clearly smaller than full-bleed. The clip's own background is pure #000,
 * so the field around the scaled-down video is invisible — Kyle just looks
 * smaller, no box/bars. The iOS launch images are regenerated at this SAME
 * fraction (see components/pwa/apple-splash-links.tsx) so the cold-launch →
 * playing-clip handoff stays seamless. The final fade to the app canvas
 * (#111110) is a soft 500ms crossfade, so the slight tonal step isn't visible.
 *
 * Why a still <img> UNDER the <video>: on an installed iOS PWA (and on slow
 * connections), a <video> renders as a BLACK box while it buffers and standalone
 * WebKit often ignores the `poster` attribute — so the clip used to show a few
 * seconds of black before Kyle appeared. Instead we show the poster still
 * (frame 0) immediately and keep the video at opacity 0 until it's actually
 * playing, then reveal it. Frame 0 of the clip == the poster == the launch
 * image, so the reveal is invisible and there is never a black gap. If autoplay
 * is blocked, the still simply stays — still Kyle, never black.
 */
const SPLASH_SRC = "/trackd-kyle-vial-splashback.mp4";
// Frame 0 of the clip — also baked into the iOS launch images, so the native
// cold-launch screen, this poster, and the first played frame are identical
// (no flash/jump on either handoff).
const SPLASH_POSTER = "/trackd-kyle-vial-splash-poster.jpg";
// Kyle's size on the splash: the clip's display height as a fraction of the
// viewport (the rest is invisible black). Lower = smaller Kyle. The iOS launch
// PNGs are regenerated at this same fraction — keep them in sync if you tweak it.
const VIDEO_HEIGHT = "58%";
const FADE_MS = 500;
// Show Kyle just long enough to register, then fade — we do NOT wait for the full
// clip (or `window.load`, which waits on the 1.1MB video itself, the old ~5s
// stall). The app shell is already mounted under the overlay by the time this
// runs, so fading here reveals a ready screen, not a blank one.
const HOLD_MS = 1400; // how long Kyle is shown before the fade begins
const MAX_MS = 2600; // hard ceiling, even on a slow/janky launch

export function SplashScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);
  // The video stays invisible (poster still showing through) until it actually
  // starts playing — see the component doc comment.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Respect reduced motion: skip the moving splash entirely. The app's own
    // fade-in still covers the transition. (Deferred a frame so we're not
    // setting state synchronously inside the effect body.)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(raf);
    }

    const video = videoRef.current;
    if (video) {
      // React can drop the `muted` attribute on hydration, which blocks
      // autoplay — set it on the element and nudge play() to be safe.
      video.muted = true;
      void video.play().catch(() => {});
    }

    let triggered = false;
    const fadeOut = () => {
      if (triggered) return;
      triggered = true;
      setFading(true);
    };

    // Fade after a short hold — fast and predictable, regardless of how long the
    // clip or the network takes. MAX_MS is just a belt-and-braces ceiling.
    const hold = window.setTimeout(fadeOut, HOLD_MS);
    const cap = window.setTimeout(fadeOut, MAX_MS);

    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(cap);
    };
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden="true"
      onTransitionEnd={(e) => {
        // Only the overlay's OWN fade ends the splash — ignore the video
        // reveal transition bubbling up from the child.
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
        // Reveal only once frames are actually rendering, so the black buffering
        // box never shows; the poster still sits underneath until then.
        onPlaying={() => setRevealed(true)}
        // If the clip finishes before the app is ready, fade out on its end
        // rather than freezing on the last frame.
        onEnded={() => setFading(true)}
      />
    </div>
  );
}
