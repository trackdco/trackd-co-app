"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Splash video overlay — Kyle the vial.
 *
 * Plays the splash clip full-screen on launch, lets Kyle ANIMATE, then crossfades
 * into the app (the same 500ms fade the shell uses). The fade is driven by the clip
 * — it fades a short, tunable PLAY_MS after the video actually starts advancing, or
 * on the clip's own `ended`, whichever is first. It does NOT wait on `window.load`.
 *
 * iOS robustness — why we POLL instead of trusting `onPlaying`: on a fast cached
 * relaunch of an installed PWA, the muted `autoplay` often fires BEFORE React
 * attaches its `playing` listener, so the event is missed and the video would never
 * be revealed (you'd see only the static poster — exactly the "animates the first
 * time, static after" bug). And iOS standalone sometimes ignores the first
 * `play()`. So we (a) retry `play()` and (b) poll `currentTime`: the moment frames
 * are actually advancing we reveal the video and start the fade timer. If it never
 * advances (autoplay genuinely blocked), NO_START_MS fades into the app rather than
 * stranding the user on the poster.
 *
 * Why a still <img> UNDER the <video>: a <video> renders as a BLACK box while it
 * buffers and standalone WebKit often ignores `poster`, so we paint the poster
 * still (frame 0) immediately and keep the video at opacity 0 until it's actually
 * advancing, then reveal it. Frame 0 == poster == the native launch image, so the
 * reveal is invisible and there's never a black gap.
 *
 * Mounted once in the root layout; mobile only (desktop gets the interstitial).
 * Offline: the clip + poster are precached by the service worker (public/sw.js).
 */
const SPLASH_SRC = "/trackd-kyle-vial-splashback.mp4";
const SPLASH_POSTER = "/trackd-kyle-vial-splash-poster.jpg";
const VIDEO_HEIGHT = "58%";
const FADE_MS = 500;
// How long Kyle animates after the clip starts advancing, before the crossfade.
const PLAY_MS = 2800;
// If the clip never starts advancing by here (autoplay blocked), fade in anyway.
const NO_START_MS = 2400;
// Absolute backstop so a wedged splash can never stick.
const MAX_MS = 7000;

export function SplashScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);
  // The video stays invisible (poster still showing through) until it's actually
  // advancing — see the component doc comment.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Respect reduced motion: skip the moving splash entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(raf);
    }

    const video = videoRef.current;
    let playCap: number | undefined;
    let poll: number | undefined;
    let revealedLocal = false;

    const startFade = () => setFading(true);

    // Backstops: fade in even if the clip never starts (autoplay blocked) and an
    // absolute ceiling so the splash can never stick.
    const noStart = window.setTimeout(startFade, NO_START_MS);
    const cap = window.setTimeout(startFade, MAX_MS);

    // The clip is genuinely playing (frames advancing): reveal it over the
    // identical poster, stop the no-start/poll fallbacks, and let it animate for
    // PLAY_MS before the crossfade.
    const markPlaying = () => {
      if (revealedLocal) return;
      revealedLocal = true;
      setRevealed(true);
      window.clearTimeout(noStart);
      if (poll !== undefined) window.clearInterval(poll);
      playCap = window.setTimeout(startFade, PLAY_MS);
    };

    if (video) {
      // React can drop `muted` on hydration, which blocks autoplay — set it on the
      // element and nudge play().
      video.muted = true;
      const tryPlay = () => {
        void video.play().catch(() => {});
      };
      tryPlay();

      video.addEventListener("playing", markPlaying);
      video.addEventListener("timeupdate", markPlaying);
      video.addEventListener("ended", startFade);

      // The reliable cross-launch detector: poll whether the clip is advancing
      // (catches the missed-`playing`-event case) and keep retrying play() until it
      // is. Cleared by markPlaying once it's revealed.
      let lastT = -1;
      poll = window.setInterval(() => {
        if (video.paused) tryPlay();
        if (video.currentTime > 0 && video.currentTime !== lastT) markPlaying();
        lastT = video.currentTime;
      }, 120);
    }

    return () => {
      window.clearTimeout(noStart);
      window.clearTimeout(cap);
      if (playCap !== undefined) window.clearTimeout(playCap);
      if (poll !== undefined) window.clearInterval(poll);
      if (video) {
        video.removeEventListener("playing", markPlaying);
        video.removeEventListener("timeupdate", markPlaying);
        video.removeEventListener("ended", startFade);
      }
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
      />
    </div>
  );
}
