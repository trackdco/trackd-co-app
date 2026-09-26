"use client";

import { useEffect, useRef, type RefObject } from "react";

import { currentLook, EASE, reducedMotion, useIsoLayoutEffect } from "@/components/progress/markers/motion";
import { SHEET_CONTENT } from "@/lib/feel/overlay";
import { pinFloor, pinLift, type ScreenRect } from "@/lib/progress/markerPick";
import { PRIMARY_BUTTON } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/** Room kept between the pinned bar and what it sits above (the tab bar, the +, the screen's edge). */
const PIN_GAP = 10;

/**
 * THE WHITE "ADD N" (markers8 `.mkadd8`): it rises in (8px up, fading in, 260ms)
 * once something is ticked, and stays pinned at the bottom of the panel, so it
 * is in view whenever something is ticked however long the picker runs.
 * Unticking the last chip sends it back down the way it came.
 *
 * The final-check page pins it with `position: sticky`. Here the panel is
 * `overflow: hidden` (its height eases as tiles switch), and a sticky child of
 * an overflow box never sticks: that is why "Add 8" needed a scroll (W8). So
 * the bar sits in the flow at the picker's foot and is LIFTED, frame by frame
 * while the picker is on screen, just as far as sticky would lift it: never
 * above the picker's top, never below what you can see, and above the tab bar
 * and the + when they overlap it. Inside a sheet, the sheet (or its scroll box)
 * is what you can see. With the keyboard up, it sits on the keyboard.
 */
export function AddBar({
  count,
  visible,
  onAdd,
  onLeft,
}: {
  count: number;
  /** False while it leaves (its last tick undone). */
  visible: boolean;
  onAdd: () => void;
  /** Its leave has finished: it can go. */
  onLeft: () => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const onLeftRef = useRef(onLeft);
  useIsoLayoutEffect(() => {
    onLeftRef.current = onLeft;
  });

  usePinnedToView(slotRef, pinRef);

  // In and out on the same path, each starting from wherever it is now.
  useIsoLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const reduce = reducedMotion();
    const hidden: Keyframe = { opacity: 0, transform: reduce ? "none" : "translateY(8px)" };
    const shown: Keyframe = { opacity: 1, transform: "none" };
    const from = first.current ? hidden : currentLook(el);
    first.current = false;
    el.getAnimations().forEach((a) => a.cancel());
    const a = el.animate([from, visible ? shown : hidden], {
      duration: reduce ? 160 : visible ? 260 : 200,
      easing: visible ? EASE : "ease-in",
      fill: "forwards",
    });
    if (!visible) a.finished.then(() => onLeftRef.current()).catch(() => {});
  }, [visible]);

  return (
    <div ref={slotRef} className="mt-1 pt-2.5">
      <div ref={pinRef} className="pointer-events-none relative z-10">
        <div ref={bodyRef} inert={!visible}>
          <button type="button" onClick={onAdd} className={cn(PRIMARY_BUTTON, "pointer-events-auto w-full")}>
            Add {count}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The box the picker is seen through, when it is not the page: the nearest one
 * that scrolls it, else the sheet it is in (a sheet covers the tab bar and the
 * + stands down under it, so nothing fixed counts there).
 */
function viewBoxOf(from: HTMLElement): HTMLElement | null {
  for (let el = from.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return from.closest<HTMLElement>(SHEET_CONTENT);
}

/** What is fixed along the bottom of the page: the tab bar, the + (unless it
 *  has stepped aside), an in-place edit's Save bar, and anything marked
 *  `data-pinned-bottom`. */
function fixedAlongBottom(): ScreenRect[] {
  const out: ScreenRect[] = [];
  const add = (el: Element | null | undefined) => {
    if (el) out.push(el.getBoundingClientRect());
  };
  add(document.querySelector("[data-bottom-nav]"));
  const layer = document.querySelector<HTMLElement>("[data-quick-actions]");
  if (layer && Number(getComputedStyle(layer).opacity) > 0.05) {
    add(layer.querySelector('button[aria-haspopup="dialog"]'));
  }
  document.querySelectorAll(".edit-action-bar, [data-pinned-bottom]").forEach(add);
  return out;
}

/**
 * Lifts `pin` (inside `slot`) as `position: sticky; bottom` would. Runs a frame
 * loop only while the picker is on screen; everything it moves is a transform.
 */
function usePinnedToView(slotRef: RefObject<HTMLDivElement | null>, pinRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const slot = slotRef.current;
    const pin = pinRef.current;
    const picker = slot?.parentElement;
    if (!slot || !pin || !picker) return;

    let raf = 0;
    let frame = 0;
    let last = 0;
    let onScreen = true;
    let box: HTMLElement | null = null;
    let fixed: ScreenRect[] = [];

    const place = (lift: number) => {
      if (Math.abs(lift - last) < 0.5) return;
      last = lift;
      pin.style.transform = lift ? `translate3d(0, ${lift}px, 0)` : "";
    };

    const tick = () => {
      raf = 0;
      if (!onScreen) {
        place(0);
        return;
      }
      if (frame++ % 15 === 0) {
        box = viewBoxOf(picker);
        fixed = box ? [] : fixedAlongBottom();
      }
      const vv = window.visualViewport;
      let top = vv ? vv.offsetTop : 0;
      let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      if (box) {
        const b = box.getBoundingClientRect();
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
      const s = slot.getBoundingClientRect();
      const floor = pinFloor(top, bottom, s, fixed, PIN_GAP);
      place(pinLift(s, floor, picker.getBoundingClientRect().top));
      raf = requestAnimationFrame(tick);
    };

    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            if (onScreen && !raf) raf = requestAnimationFrame(tick);
          });
    io?.observe(picker);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      pin.style.transform = "";
    };
  }, [slotRef, pinRef]);
}
