"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Splash video overlay — Kyle the vial.
 *
 * Plays the splash clip full-screen the moment the app loads, then fades into
 * the app (same 500ms fade the shell already uses) as soon as the page is
 * ready. It does NOT wait for the whole ~5s clip — readiness wins.
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
const MAX_MS = 5500; // safety cap — never outlive the ~5s clip, even on a slow load

export function SplashScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

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

    // Fade the instant the app is ready (assets loaded) — not when the clip ends.
    let raf = 0;
    if (document.readyState === "complete") raf = requestAnimationFrame(fadeOut);
    else window.addEventListener("load", fadeOut, { once: true });

    const cap = window.setTimeout(fadeOut, MAX_MS);

    return () => {
      window.removeEventListener("load", fadeOut);
      window.clearTimeout(cap);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden="true"
      onTransitionEnd={() => {
        if (fading) setDone(true);
      }}
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity ease-out lg:hidden ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <video
        ref={videoRef}
        className="w-auto max-w-full object-contain"
        style={{ height: VIDEO_HEIGHT }}
        src={SPLASH_SRC}
        poster={SPLASH_POSTER}
        autoPlay
        muted
        playsInline
        preload="auto"
        // If the clip finishes before the app is ready, fade out on its end
        // rather than freezing on the last frame.
        onEnded={() => setFading(true)}
      />
    </div>
  );
}
