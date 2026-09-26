"use client"

import { useLayoutEffect, useRef } from "react"

import { cn } from "@/lib/utils"

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

/**
 * A JOURNAL PHOTO THAT ARRIVES ONCE IT HAS LOADED (W9, Adrian 26 Sep: "a photo
 * added to an entry animates in once it has loaded, a quick fade down"). Until
 * its bytes are in, the tile shows its own grey ground; then the picture fades
 * in while settling 6px down into place (240ms). Reduced motion: the fade only.
 *
 * Used by Home's journal card and the full-page writer. An image already in the
 * cache when it mounts is shown at once, with no animation to wait on.
 */
export function JournalPhoto({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLImageElement>(null)

  // Already loaded (a cached signed link, or the same element given the same
  // source again): show it, no fade.
  useLayoutEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth > 0) img.style.opacity = "1"
  }, [src])

  function arrive(img: HTMLImageElement) {
    if (img.style.opacity === "1") return
    img.style.opacity = "1"
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    img.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(-6px)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: reduce ? 160 : 240, easing: EASE },
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      decoding="async"
      style={{ opacity: 0 }}
      onLoad={(e) => arrive(e.currentTarget)}
      className={cn("block", className)}
    />
  )
}
