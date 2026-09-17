"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * THE HERO PHONE: ADRIAN'S RECORDING, WITH ITS BACKGROUND CUT AWAY
 * (2026-09-17).
 *
 * He supplied a 4K, 60fps, 69 second HEVC recording of the app on an iPhone,
 * already transparent round the phone. It is cropped to a box centred on the
 * phone (wide enough for the tilt it opens with), scaled to 1294x1280 at
 * 30fps, and shipped twice, because no single file is transparent everywhere:
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
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v || !engine || reduce) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.playsInline = true;
    const attempt = v.play();
    if (attempt) attempt.catch(() => setFailed(true));
  }, [engine, reduce]);

  const still = reduce || failed;

  return (
    <div role="img" aria-label={label} className={cn("lp-hero-video relative", className)}>
      {engine && !still ? (
        <video
          ref={video}
          key={engine}
          className={cn(
            "lp-hero-video-media transition-opacity duration-500 ease-out motion-reduce:transition-none",
            playing ? "opacity-100" : "opacity-0",
          )}
          src={engine === "hevc" ? MOV : WEBM}
          muted
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {still ? (
        <Image
          src={STILL}
          alt=""
          width={1294}
          height={1280}
          sizes="(min-width: 800px) 44.5rem, 39rem"
          className="lp-hero-video-media"
        />
      ) : null}
    </div>
  );
}
