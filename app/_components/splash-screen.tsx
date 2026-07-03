"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Splash overlay — Kyle the vial.
 *
 * PRIORITY: the app and the static splash image load FIRST; the video is a
 * best-effort bonus that must never slow the launch. We paint the poster still
 * (frame 0) at high fetch priority so the branded splash appears instantly, then
 * crossfade into the app (the same 500ms fade the shell uses). The video is NOT
 * fetched or played during the app's initial load — it stays at `preload="none"`
 * with no `autoplay`, and we defer starting it to the first idle frame
 * (requestIdleCallback), at low fetch priority. On a slow or busy launch the page
 * never idles before the splash fades, so the clip is simply skipped and the user
 * gets a fast static splash: a static image that loads fast beats a video that
 * stalls the app.
 *
 * The fade is driven by TIMERS, never by the video: it fades a short PLAY_MS after
 * the clip actually starts advancing, or on NO_START_MS if the clip never starts
 * (deferred / blocked / too slow), or on the clip's own `ended` — whichever is
 * first. It does NOT wait on `window.load` or on the video.
 *
 * iOS robustness — why we POLL instead of trusting `onPlaying`: once we DO start
 * the clip, on a fast cached relaunch the muted `play()` often resolves BEFORE
 * React attaches its `playing` listener, so the event is missed and the video
 * would never be revealed (you'd see only the static poster — the "animates the
 * first time, static after" bug). And iOS standalone sometimes ignores the first
 * `play()`. So we (a) retry `play()` and (b) poll `currentTime`: the moment frames
 * are actually advancing we reveal the video and start the fade timer. If it never
 * advances, NO_START_MS fades into the app rather than stranding the user on the
 * poster.
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
// The clip has a dark-but-not-black square baked into its 9:16 frame, so it shows a
// hard rectangular edge against the pure-black overlay. Feather it with a soft
// circular vignette centred on Kyle so the box dissolves into the background instead.
// `closest-side` ⇒ the radius is half the (portrait) element's width, so the fade
// lands around the square's left/right edges; Kyle + his shadow stay inside the
// opaque core and the square's corners fade fully to black. Applied identically to
// the poster <img> and the <video> so the reveal crossfade stays seamless. Tunable:
// raise the first stop to keep more of Kyle crisp, lower the second to fade harder.
const SPLASH_MASK =
  "radial-gradient(circle closest-side at 50% 50%, black 56%, transparent 90%)";
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
    let idle: number | undefined;
    let revealedLocal = false;

    const startFade = () => setFading(true);

    // Backstops run on their OWN timers — the fade never waits on the video. Fade
    // in even if the clip never starts (deferred / blocked / too slow), plus an
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

    // Best-effort, DEPRIORITIZED clip. We only touch the video once the browser is
    // idle — i.e. after the app's own resources have been fetched — so the clip's
    // network fetch never competes with the launch. If the page is still busy when
    // NO_START_MS fires, the splash has already faded on the static poster and this
    // never runs: the intended trade-off (fast static splash > app-stalling video).
    const startVideo = () => {
      if (!video) return;
      // Hint the browser this fetch is low priority (honoured where supported).
      video.setAttribute("fetchpriority", "low");
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
    };

    // Defer the clip to the first idle frame so its fetch yields to the app. The
    // `timeout` is only a ceiling so a cached relaunch still gets to play; on
    // browsers without requestIdleCallback (older iOS) a small setTimeout stands in.
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(startVideo, { timeout: 1200 });
    } else {
      idle = window.setTimeout(startVideo, 300);
    }

    return () => {
      window.clearTimeout(noStart);
      window.clearTimeout(cap);
      if (playCap !== undefined) window.clearTimeout(playCap);
      if (poll !== undefined) window.clearInterval(poll);
      if (idle !== undefined) {
        // `idle` is a requestIdleCallback handle when available, else a timeout id;
        // cancelling the wrong kind is a harmless no-op, so cover both.
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idle);
        }
        window.clearTimeout(idle);
      }
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
      className={`fixed inset-0 z-[9999] bg-bg-base transition-opacity ease-out lg:hidden ${
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
        style={{
          height: VIDEO_HEIGHT,
          WebkitMaskImage: SPLASH_MASK,
          maskImage: SPLASH_MASK,
        }}
      />
      <video
        ref={videoRef}
        className={`pointer-events-none absolute left-1/2 top-1/2 max-w-full -translate-x-1/2 -translate-y-1/2 object-contain transition-opacity duration-300 ${
          revealed ? "opacity-100" : "opacity-0"
        }`}
        style={{
          height: VIDEO_HEIGHT,
          WebkitMaskImage: SPLASH_MASK,
          maskImage: SPLASH_MASK,
        }}
        src={SPLASH_SRC}
        muted
        playsInline
        // Deferred + deprioritized: no autoplay and preload="none" so the clip does
        // ZERO network work on mount. The effect starts it on the first idle frame,
        // at low fetch priority, so the app's own resources load first.
        preload="none"
      />
    </div>
  );
}
