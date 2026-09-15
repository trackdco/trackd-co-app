"use client";

import { useEffect, useRef, useState } from "react";

import { PrimaryCta } from "./cta";

/**
 * THE BAR THAT ARRIVES WHEN THE HERO LEAVES (spec 3-02 §States).
 *
 * Hidden while the hero is on screen, because the hero already carries the same
 * button and two of the same control in view at once is a page shouting.
 *
 * ## ⚠️ HIDDEN MEANS UNREACHABLE, NOT JUST INVISIBLE
 *
 * A translated-off-screen bar still takes tab focus and is still read out, so
 * the first Tab on a fresh page would land on a control nobody can see. `inert`
 * removes it from focus and the accessibility tree in one attribute, and comes
 * back the moment the bar does.
 *
 * ## Why an observer rather than a scroll handler
 *
 * A scroll listener runs on the main thread on every frame of every scroll;
 * this fires twice in a page's life. The threshold is deliberately 0: the bar
 * belongs on screen the instant the hero's last pixel leaves, not at some
 * fraction of it.
 */
export function StickyCta() {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // `boundingClientRect.top < 0` distinguishes "scrolled PAST the hero"
        // from "not yet reached it", which matters on a browser restoring a
        // deep scroll position on reload.
        setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      inert={!shown}
      className={[
        "landing-cta-bar fixed inset-x-0 bottom-0 z-40",
        shown ? "landing-cta-bar-on" : "",
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-[35rem] px-5 py-3">
        <PrimaryCta />
      </div>
    </div>
  );
}
