"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * THE HERO PHONE: ADRIAN'S RECORDING, WITH ITS BACKGROUND CUT AWAY
 * (2026-09-17).
 *
 * He supplied a 4K, 60fps, 69 second HEVC recording of the app on an iPhone,
 * already transparent round the phone ("trackd-phone-landing-mockup-final",
 * which replaced a first cut that opened dark). It is cropped to a box centred
 * on the phone (wide enough for the tilt it opens with), scaled to 1518x1280
 * at 30fps, and shipped twice, because no single file is transparent
 * everywhere:
 *
 * - **`hero-phone.mov`, HEVC with alpha**, for Safari and for every browser on
 *   an iPhone (all WebKit).
 * - **`hero-phone.webm`, VP9 with alpha**, for Chrome, Edge and Firefox.
 *
 * ## ⚠️ WHY THE FILE IS CHOSEN IN SCRIPT, NOT WITH `<source>` ORDER
 *
 * Chrome on a Mac reports that it can play `hvc1`, and it can, but it drops
 * the alpha layer and draws the transparent area BLACK. And Safari reports
 * that it can play VP9 WebM, and also drops the alpha. So whichever file is
 * listed first, one of the two browsers picks the wrong one. The engine is
 * decided once on the client instead.
 *
 * ## It plays ONCE and holds its last frame (Adrian's ask)
 *
 * No `loop`, so a finished video stays on its final frame. If autoplay is
 * refused (iOS Low Power Mode refuses it) or the file fails, the last frame is
 * shown as a still instead; under reduced motion the still is all there is.
 * No fade-in: it shows at full brightness from its first frame (Adrian).
 *
 * ## The opening is cut off, so the edges fade while it is
 *
 * The recording opens zoomed in, with the phone running off the bottom of the
 * frame until about 2.4s (and off the top for the first half second). Those
 * pixels do not exist, so the cut is hidden instead: the bottom and top of the
 * box fade deeply while the phone zooms in, and the fade eases away as it
 * settles.
 *
 * ⚠️ DRIVEN FROM THE VIDEO'S OWN CLOCK, frame by frame, not by a CSS
 * transition. A transition on the mask's custom properties interpolated in
 * Chromium and JUMPED in WebKit, which flashed the lower half of the phone
 * bright at the switch; and a timer would drift from a video that buffers.
 * So for the first few seconds a rAF loop reads `currentTime` and writes the
 * two stops; after that, and for the still, the settled mask in
 * `globals.css` applies.
 *
 * ## ⚠️ `muted` IS SET BY HAND
 *
 * React sets `muted` as a property and never writes the attribute, and iOS
 * decides whether a video may autoplay from the attribute. So the effect sets
 * both, then calls `play()` itself.
 */

const MOV = "/landing/hero-phone.mov";
const WEBM = "/landing/hero-phone.webm";
const STILL = "/landing/hero-phone-end.webp";

/**
 * The edge fade, as a function of the recording's time. Measured off the
 * source: the phone runs off the TOP of the frame until ~0.6s and off the
 * BOTTOM until ~2.4s, then holds still. Each stop eases from its opening value
 * to its settled one across a window that ends after its edge has cleared.
 */
const FADE = {
  bottom: { from: 68, to: 95, start: 1.5, end: 3.0 },
  top: { from: 7, to: 0, start: 0.45, end: 1.1 },
} as const;
const OPENING_ENDS = FADE.bottom.end;

function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return 1 - Math.pow(1 - t, 3);
}

function stop(k: (typeof FADE)[keyof typeof FADE], t: number): string {
  return `${k.from + (k.to - k.from) * ease((t - k.start) / (k.end - k.start))}%`;
}

type Engine = "hevc" | "webm";

function detectEngine(): Engine {
  const ua = navigator.userAgent;
  const iOS =
    /iP(hone|ad|od)/.test(ua) ||
    // iPadOS asks for the desktop site and reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|opr|android).)*safari/i.test(ua);
  return iOS || safari ? "hevc" : "webm";
}

const noop = () => () => {};

function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function HeroVideo({ label, className }: { label: string; className?: string }) {
  // Both answers are client-only. The server snapshot is "not decided yet",
  // which renders an empty, correctly sized box: no flash of the wrong file.
  const engine = useSyncExternalStore<Engine | null>(noop, detectEngine, () => null);
  const reduce = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v || !engine || reduce) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.playsInline = true;
    const attempt = v.play();
    if (attempt) attempt.catch(() => setFailed(true));

    let frame = 0;
    const tick = () => {
      // Swapped for the still (autoplay refused, file failed): stop quietly.
      if (!v.isConnected) return;
      const t = v.currentTime;
      v.style.setProperty("--lp-fade-b", stop(FADE.bottom, t));
      v.style.setProperty("--lp-fade-t", stop(FADE.top, t));
      if (t >= OPENING_ENDS || v.ended) {
        setOpened(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, reduce]);

  const still = reduce || failed;
  const settled = still || opened;

  return (
    <div
      role="img"
      aria-label={label}
      data-settled={settled ? "" : undefined}
      className={cn("lp-hero-video relative", className)}
    >
      {engine && !still ? (
        <video
          ref={video}
          key={engine}
          className="lp-hero-video-media"
          src={engine === "hevc" ? MOV : WEBM}
          muted
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden
          onEnded={() => setOpened(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {still ? (
        <Image
          src={STILL}
          alt=""
          width={1518}
          height={1280}
          sizes="(min-width: 800px) 52.5rem, 46rem"
          className="lp-hero-video-media"
        />
      ) : null}
    </div>
  );
}
