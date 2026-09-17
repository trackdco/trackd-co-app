"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True once `ref` has come into view, and it stays true.
 *
 * ONE-SHOT on purpose. Everything on the public pages that waits for the
 * viewport is a moment (an underline drawn, Kyle arriving), and a moment that
 * replays every time you scroll past it stops being one.
 *
 * Starts `false` on the server and on the first client render, so the markup
 * is identical on both and nothing flashes. Where IntersectionObserver is
 * missing the moment simply happens straight away.
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { threshold = 0.35, rootMargin = "0px" }: { threshold?: number; rootMargin?: string } = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      // Deferred rather than set in the effect body, so this is not a
      // synchronous cascade (`react-hooks/set-state-in-effect`).
      const id = window.requestAnimationFrame(() => setInView(true));
      return () => window.cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, inView, threshold, rootMargin]);

  return inView;
}
