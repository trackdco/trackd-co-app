"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, Trash, X } from "@/components/icons";

import { ConfirmDialog } from "@/components/feel/ConfirmDialog";
import { PRESS, ROW_META } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { dayShort } from "@/lib/format/date";
import { showToast } from "@/lib/toast";
import {
  dayPhotosFor,
  dayWeightKg,
  indexInDay,
  photoPositionText,
  stepPhoto,
} from "@/lib/progress/photoCard";
import { poseShortLabel, type ProgressPhoto } from "@/lib/progress/photos";
import {
  VIEWER,
  clampZoom,
  decideAxis,
  dismissFrame,
  dragTrackX,
  inside,
  isTap,
  originPercent,
  pinchZoom,
  rectTransform,
  shouldDismiss,
  snapIndex,
  trackX,
  transformCss,
  velocity,
  wheelZoom,
  type Axis,
  type Sample,
} from "@/lib/progress/viewerGesture";
import { formatWeight, type WeightUnit } from "@/lib/weight";
import { deleteProgressPhoto } from "@/app/(app)/progress/actions";

/** The photo's box: as wide as the screen allows, 3:4 (photos are framed 3:4
 *  when added), leaving room for the controls above and the dots below. */
const FRAME_WIDTH =
  "min(100%, calc((100dvh - 176px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) * 0.75))";

interface Dom {
  bg: HTMLDivElement | null;
  stage: HTMLDivElement | null;
  track: HTMLDivElement | null;
  top: HTMLDivElement | null;
  bot: HTMLDivElement | null;
  frames: (HTMLDivElement | null)[];
}

/** What the gesture handlers read between renders. */
interface Live {
  at: number;
  count: number;
  day: ProgressPhoto[];
  chrome: boolean;
  zoomed: boolean;
  confirming: boolean;
  closing: boolean;
  /** The close was ours (×, the dark, a swipe, Escape): it has animated. */
  closedByUs: boolean;
}

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * THE PHOTO VIEWER (build-brief-final §3.15). A photo grows out of the tile
 * you tapped (420ms) and shrinks back into it when you close. Swipe sideways
 * between that day's photos (rubber-banded at the ends, the release projected
 * at its speed). The pose, date and weight sit at the TOP beside the ×; the
 * dots at the BOTTOM. The backdrop is black at 93%, so the app barely shows.
 * Tap the photo to hide or show the controls; tap the dark around it, swipe it
 * down (it follows the finger and the backdrop fades), press × or Escape to
 * close. Pinch to zoom (two fingers; ctrl + wheel in Chromium; Safari's own
 * gesture events), and it springs back when you let go (420ms,
 * cubic-bezier(.34,1.3,.64,1)); with a mouse, press and hold to zoom and move
 * to look around. Arrow keys move between photos.
 *
 * Reduced motion: short fades, no growth, no spring.
 *
 * The delete stays here, on every surface that opens it (a block's
 * retrospective included), behind the one confirm. A note on the day shows
 * over the dots.
 *
 * Contract: `open`, `onOpenChange`, `photo`, `unit`, `onDeleted` as before.
 * `photos` (optional) is the pool the day's photos come from; without it the
 * viewer shows `photo` alone. `originFor` (optional) returns the tile a photo
 * grew from; without one it fades in and out. `label` (optional) names a
 * photo at the top and in its alt text, for photos that have no pose (a
 * journal entry's); `canDelete={false}` leaves the delete off, where the
 * surface underneath owns removing the photo.
 *
 * Built on Radix's dialog for the focus trap, the scroll lock and hiding the
 * app from assistive tech, portalled straight onto `<body>` (the card sits in
 * a block that rises in with a transform, which would pin anything `fixed`
 * inside it to that block). Its content carries `data-slot="sheet-content"` so
 * the confirm (`PopDialog`) renders inside it and stays pressable.
 */
export function ProgressPhotoViewer({
  open,
  onOpenChange,
  photo,
  unit,
  onDeleted,
  photos,
  originFor,
  label = defaultLabel,
  canDelete = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: ProgressPhoto | null;
  unit: WeightUnit;
  onDeleted: () => void;
  /** The pool the photo's day comes from, to swipe through. */
  photos?: ProgressPhoto[];
  /** The tile a photo grew out of, so it can shrink back into it. */
  originFor?: (photo: ProgressPhoto) => HTMLElement | null;
  /** The words at the top ("Front · 25 Sep"); also the photo's alt text. */
  label?: (photo: ProgressPhoto) => string;
  /** False where the surface underneath removes photos itself. */
  canDelete?: boolean;
}) {
  const router = useRouter();

  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  // Retained through the close, so the photo does not blank as it leaves.
  const [shown, setShown] = useState<ProgressPhoto | null>(photo);
  const [index, setIndex] = useState(() => indexInDay(dayPhotosFor(photo, photos), photo));
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMounted(true);
      if (photo) setShown(photo);
      setIndex(indexInDay(dayPhotosFor(photo, photos), photo));
      setChrome(true);
      setZoomed(false);
      setConfirming(false);
      setBusy(false);
      setError(null);
    }
  } else if (open && photo !== null && photo.id !== shown?.id) {
    setShown(photo);
    setIndex(indexInDay(dayPhotosFor(photo, photos), photo));
  }

  const day = useMemo(() => dayPhotosFor(shown, photos), [shown, photos]);
  const at = Math.min(index, Math.max(0, day.length - 1));
  const current = day[at] ?? shown;
  const showChrome = chrome && !zoomed;

  const dom = useRef<Dom>({ bg: null, stage: null, track: null, top: null, bot: null, frames: [] });
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const live = useRef<Live>({
    at: 0,
    count: 0,
    day: [],
    chrome: true,
    zoomed: false,
    confirming: false,
    closing: false,
    closedByUs: false,
  });
  const originForRef = useRef(originFor);
  const onOpenChangeRef = useRef(onOpenChange);

  // Declared first, so every effect below reads this render's values.
  useLayoutEffect(() => {
    const l = live.current;
    l.at = at;
    l.count = day.length;
    l.day = day;
    l.chrome = chrome;
    l.zoomed = zoomed;
    l.confirming = confirming;
    originForRef.current = originFor;
    onOpenChangeRef.current = onOpenChange;
  });

  const originOf = useCallback((): HTMLElement | null => {
    const l = live.current;
    const p = l.day[l.at];
    if (!p) return null;
    const el = originForRef.current?.(p) ?? null;
    return el && el.isConnected ? el : null;
  }, []);

  /** Every close of ours goes through here: it animates, THEN tells the caller. */
  const requestClose = useCallback(() => {
    const l = live.current;
    if (l.closing) return;
    l.closing = true;
    l.closedByUs = true;
    animateOut(dom.current, l.at, originOf()).then(() => {
      setMounted(false);
      onOpenChangeRef.current(false);
    });
  }, [originOf]);

  const goTo = useCallback((n: number, animate: boolean) => {
    const l = live.current;
    if (l.count === 0) return;
    const next = Math.max(0, Math.min(l.count - 1, n));
    const { stage, track } = dom.current;
    if (stage && track) {
      const ms = animate ? (reduced() ? 160 : VIEWER.snapMs) : 0;
      track.style.transition = ms ? `transform ${ms}ms ${VIEWER.ease}` : "none";
      track.style.transform = `translate3d(${trackX(next, stage.clientWidth)}px,0,0)`;
    }
    l.at = next;
    setIndex(next);
  }, []);

  // IN: place the track, then grow out of the tile (or fade in).
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const l = live.current;
    l.closing = false;
    l.closedByUs = false;
    const d = dom.current;
    if (d.stage && d.track) {
      d.track.style.transition = "none";
      d.track.style.transform = `translate3d(${trackX(l.at, d.stage.clientWidth)}px,0,0)`;
    }
    const origin = originOf();
    // Focus goes back to the tile it came from; else wherever it was.
    returnFocus.current = origin ?? (document.activeElement as HTMLElement | null);
    animateIn(d, l.at, origin);
  }, [open, mounted, originOf]);

  // OUT, when the caller closes it (after a delete): a fade, then unmount.
  useEffect(() => {
    if (open || !mounted) return;
    const l = live.current;
    if (l.closedByUs) return;
    l.closing = true;
    let alive = true;
    animateOut(dom.current, l.at, null).then(() => {
      if (alive) setMounted(false);
    });
    return () => {
      alive = false;
    };
  }, [open, mounted]);

  // The gestures. Native listeners: wheel and Safari's gesture events must be
  // non-passive to keep the page from zooming, and a drag paints every frame
  // without a render.
  useEffect(() => {
    if (!mounted) return;
    const d = dom.current;
    const stage = d.stage;
    const track = d.track;
    if (!stage || !track) return;
    const l = live.current;

    const pts = new Map<number, { x: number; y: number }>();
    let one: { x: number; y: number; t: number; axis: Axis | "hold" | null; samples: Sample[] } | null = null;
    let pinch: { d0: number; m0: { x: number; y: number } } | null = null;
    let hold: number | undefined;
    let wheelZ: number | null = null;
    let wheelT: number | undefined;
    let gestureZ: number | null = null;
    let settleT: number | undefined;

    const W = () => stage.clientWidth;
    const frame = () => d.frames[l.at] ?? null;
    const setTrack = (x: number) => {
      track.style.transition = "none";
      track.style.transform = `translate3d(${x}px,0,0)`;
    };
    const markZoomed = (z: boolean) => {
      if (l.zoomed === z) return;
      l.zoomed = z;
      setZoomed(z);
    };

    /** Set the zoom directly while fingers move. */
    const zoomTo = (z: number, about?: { x: number; y: number } | null, tx = 0, ty = 0) => {
      const el = frame();
      if (!el) return;
      window.clearTimeout(settleT);
      el.getAnimations().forEach((a) => a.cancel());
      el.style.transition = "none";
      if (about) {
        const o = originPercent(about.x, about.y, el.getBoundingClientRect());
        el.style.transformOrigin = `${o.x}% ${o.y}%`;
      }
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
      markZoomed(z > 1.02);
    };

    /** Back to 1 when they lift: a spring, or a short ease with reduced motion. */
    const springBack = () => {
      const el = frame();
      if (!el) return;
      const reduce = reduced();
      const ms = reduce ? 150 : VIEWER.springMs;
      el.style.transition = `transform ${ms}ms ${reduce ? "ease-out" : VIEWER.spring}`;
      el.style.transform = "";
      markZoomed(false);
      window.clearTimeout(settleT);
      settleT = window.setTimeout(() => {
        el.style.transition = "";
        el.style.transformOrigin = "";
      }, ms + 20);
    };

    const chromeEls = () => [d.top, d.bot].filter((c): c is HTMLDivElement => c !== null);

    const dragDown = (dx: number, dy: number) => {
      const el = frame();
      const f = dismissFrame(dx, dy);
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translate(${f.x}px, ${f.y}px) scale(${f.scale})`;
      }
      if (d.bg) d.bg.style.opacity = String(f.backdrop);
      if (l.chrome && !l.zoomed) {
        for (const c of chromeEls()) {
          c.style.transition = "none";
          c.style.opacity = String(f.chrome);
        }
      }
    };

    const settleDown = () => {
      const el = frame();
      const ms = reduced() ? 150 : 340;
      if (el) {
        el.style.transition = `transform ${ms}ms ${VIEWER.ease}`;
        el.style.transform = "";
      }
      if (d.bg) {
        d.bg.style.transition = `opacity ${ms}ms ease-out`;
        d.bg.style.opacity = "";
      }
      for (const c of chromeEls()) {
        c.style.transition = "";
        c.style.opacity = "";
      }
      window.clearTimeout(settleT);
      settleT = window.setTimeout(() => {
        if (el) el.style.transition = "";
        if (d.bg) d.bg.style.transition = "";
      }, ms + 20);
    };

    const pair = () => {
      const [a, b] = [...pts.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };

    const onDown = (e: PointerEvent) => {
      if (l.closing || l.confirming) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone; nothing to capture.
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      window.clearTimeout(hold);
      if (pts.size === 2) {
        // A second finger: whatever the first was doing becomes a pinch.
        if (one?.axis === "x") goTo(l.at, true);
        if (one?.axis === "down") settleDown();
        one = null;
        const p = pair();
        pinch = { d0: p.dist, m0: p.mid };
        zoomTo(1, p.mid);
        return;
      }
      if (pts.size > 2) return;
      const t = performance.now();
      one = { x: e.clientX, y: e.clientY, t, axis: null, samples: [{ x: e.clientX, y: e.clientY, t }] };
      // No pinch on a mouse: hold still to zoom where you pressed.
      if (e.pointerType === "mouse") {
        hold = window.setTimeout(() => {
          if (one && one.axis === null) {
            one.axis = "hold";
            zoomTo(VIEWER.holdZoom, { x: one.x, y: one.y });
          }
        }, VIEWER.holdMs);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const p = pair();
        zoomTo(pinchZoom(pinch.d0, p.dist), null, p.mid.x - pinch.m0.x, p.mid.y - pinch.m0.y);
        return;
      }
      if (!one) return;
      const dx = e.clientX - one.x;
      const dy = e.clientY - one.y;
      one.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (one.samples.length > 5) one.samples.shift();
      if (one.axis === null) {
        const axis = decideAxis(dx, dy);
        if (axis) {
          window.clearTimeout(hold);
          one.axis = axis;
        }
      }
      if (one.axis === "hold") {
        // Held and zoomed: moving looks around the photo.
        const el = frame();
        if (el) el.style.transform = `translate(${-dx * 0.8}px, ${-dy * 0.8}px) scale(${VIEWER.holdZoom})`;
      } else if (one.axis === "x") {
        setTrack(dragTrackX(l.at, W(), l.count, dx));
      } else if (one.axis === "down") {
        dragDown(dx, dy);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      window.clearTimeout(hold);
      pts.delete(e.pointerId);
      if (pinch) {
        if (pts.size < 2) {
          pinch = null;
          one = null;
          springBack();
        }
        return;
      }
      if (!one) return;
      const g = one;
      one = null;
      const cancelled = e.type === "pointercancel";
      const { vx, vy } = velocity(g.samples);
      if (g.axis === "hold") {
        springBack();
      } else if (g.axis === "x") {
        goTo(cancelled ? l.at : snapIndex(l.at, l.count, e.clientX - g.x, vx, W()), true);
      } else if (g.axis === "down") {
        if (!cancelled && shouldDismiss(e.clientY - g.y, vy)) requestClose();
        else settleDown();
      } else if (!cancelled && isTap(g.axis, performance.now() - g.t)) {
        // The dark around the photo closes; the photo shows or hides the controls.
        const el = frame();
        if (!el || !inside(g.x, g.y, el.getBoundingClientRect())) {
          requestClose();
        } else {
          l.chrome = !l.chrome;
          setChrome(l.chrome);
        }
      }
    };

    // A trackpad pinch in Chromium arrives as ctrl + wheel; it springs back
    // once the wheel stops. A plain wheel does nothing, and never scrolls the
    // page behind.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Safari's own pinch owns the zoom while it runs.
      if (!e.ctrlKey || l.closing || gestureZ !== null) return;
      if (wheelZ === null) {
        wheelZ = 1;
        zoomTo(1, { x: e.clientX, y: e.clientY });
      }
      wheelZ = wheelZoom(wheelZ, e.deltaY);
      zoomTo(wheelZ);
      window.clearTimeout(wheelT);
      wheelT = window.setTimeout(() => {
        wheelZ = null;
        springBack();
      }, 180);
    };

    // Safari's own pinch (a Mac trackpad). On iOS the pointers above already
    // carry it, so these stand down while two fingers are down.
    const onGestureStart = (ev: Event) => {
      ev.preventDefault();
      if (pts.size >= 2 || l.closing) return;
      const g = ev as SafariGestureEvent;
      gestureZ = 1;
      zoomTo(1, { x: g.clientX, y: g.clientY });
    };
    const onGestureChange = (ev: Event) => {
      ev.preventDefault();
      if (gestureZ === null || pts.size >= 2) return;
      gestureZ = clampZoom((ev as SafariGestureEvent).scale);
      zoomTo(gestureZ);
    };
    const onGestureEnd = (ev: Event) => {
      ev.preventDefault();
      if (gestureZ === null) return;
      gestureZ = null;
      springBack();
    };

    const onResize = () => setTrack(trackX(l.at, W()));

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("gesturestart", onGestureStart);
    stage.addEventListener("gesturechange", onGestureChange);
    stage.addEventListener("gestureend", onGestureEnd);
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(wheelT);
      window.clearTimeout(settleT);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("gesturestart", onGestureStart);
      stage.removeEventListener("gesturechange", onGestureChange);
      stage.removeEventListener("gestureend", onGestureEnd);
      window.removeEventListener("resize", onResize);
    };
  }, [mounted, goTo, requestClose]);

  /** Previous (-1) or Next (1), from the step keys (B35). Nothing while the
   *  delete confirm is up or the viewer is on its way out. */
  function step(dir: -1 | 1) {
    const l = live.current;
    if (l.confirming || l.closing) return;
    const to = stepPhoto(l.at, l.count, dir);
    if (to !== null) goTo(to, true);
  }

  async function handleDelete() {
    const target = current;
    if (!target) return;
    setBusy(true);
    setError(null);
    const res = await deleteProgressPhoto(target.id);
    setBusy(false);
    if (res.ok) {
      onDeleted();
      router.refresh();
      // Its file is gone with it, so there is no Undo to offer.
      showToast("Photo deleted");
    } else {
      setError(res.error ?? "Couldn’t delete. Try again.");
    }
  }

  if (!mounted || !current || typeof document === "undefined") return null;

  const weightKg = current.weightKg ?? dayWeightKg(day);
  const title = label(current);
  const reach = showChrome ? "pointer-events-auto" : "pointer-events-none";

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      {createPortal(
        <>
          <DialogPrimitive.Overlay
            ref={(el) => {
              dom.current.bg = el;
            }}
            className="fixed inset-0 z-[70] bg-black/[0.93]"
          />
          <DialogPrimitive.Content
            data-slot="sheet-content"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              closeRef.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(e) => {
              // Back to the tile it grew from (Radix would look for a trigger).
              e.preventDefault();
              const back = returnFocus.current;
              if (back && back.isConnected) back.focus({ preventScroll: true });
            }}
            onEscapeKeyDown={(e) => {
              // The confirm closes itself; the viewer stays.
              if (live.current.confirming) e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (live.current.confirming) return;
              if (e.key === "ArrowRight") goTo(live.current.at + 1, true);
              else if (e.key === "ArrowLeft") goTo(live.current.at - 1, true);
            }}
            className="fixed inset-0 z-[70] outline-none select-none"
          >
            <div
              ref={(el) => {
                dom.current.stage = el;
              }}
              className="absolute inset-0 cursor-grab touch-none overflow-hidden"
            >
              <div
                ref={(el) => {
                  dom.current.track = el;
                }}
                className="flex h-full will-change-transform"
              >
                {day.map((p, i) => (
                  <div
                    key={p.id}
                    aria-hidden={i !== at}
                    className="flex h-full w-full shrink-0 items-center justify-center px-3"
                  >
                    <div
                      ref={(el) => {
                        dom.current.frames[i] = el;
                      }}
                      className="relative overflow-hidden rounded-xl bg-black"
                      style={{ width: FRAME_WIDTH, aspectRatio: "3 / 4" }}
                    >
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.url}
                          alt={label(p)}
                          draggable={false}
                          decoding="async"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-text-muted">
                          Couldn&apos;t load this photo.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* The top: ×, then the pose, date and weight, then delete. Taps
                between the buttons fall through to the dark behind. */}
            <div
              ref={(el) => {
                dom.current.top = el;
              }}
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 px-3 pt-[max(12px,calc(env(safe-area-inset-top)_+_8px))] pb-2 transition-opacity duration-200",
                !showChrome && "opacity-0",
              )}
            >
              <button
                ref={closeRef}
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className={cn(PRESS.button, "inst-ghost flex h-9 w-9 shrink-0 items-center justify-center text-foreground", reach)}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-[13px] leading-snug font-normal text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {weightKg != null ? (
                  <p className={ROW_META}>
                    {formatWeight(weightKg, unit)} {unit}
                  </p>
                ) : null}
              </div>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  aria-label="Delete this photo"
                  className={cn(
                    PRESS.button,
                    "inst-ghost flex h-9 w-9 shrink-0 items-center justify-center text-text-muted disabled:opacity-50",
                    reach,
                  )}
                >
                  <Trash className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>

            {/* The bottom: the day's note, and the dots. */}
            <div
              ref={(el) => {
                dom.current.bot = el;
              }}
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pt-2 pb-[max(20px,calc(env(safe-area-inset-bottom)_+_14px))] transition-opacity duration-200",
                !showChrome && "opacity-0",
              )}
            >
              {current.note ? (
                <p className="line-clamp-3 max-w-md text-center text-[13px] leading-snug whitespace-pre-wrap text-foreground">
                  {current.note}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-[13px] text-state-error">
                  {error}
                </p>
              ) : null}
              {day.length > 1 ? (
                <div aria-hidden className="flex gap-1.5">
                  {day.map((p, i) => (
                    <i
                      key={p.id}
                      className={cn(
                        "block h-1.5 w-1.5 rounded-full transition-[background-color,scale] duration-200",
                        i === at ? "scale-[1.15] bg-foreground" : "bg-border-strong",
                      )}
                    />
                  ))}
                </div>
              ) : null}
              <span className="sr-only" aria-live="polite">
                {photoPositionText(at, day.length)}
              </span>
            </div>

            {day.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-disabled={stepPhoto(at, day.length, -1) === null ? true : undefined}
                  aria-label="Previous photo"
                  className={cn(STEP_KEY, "left-3")}
                >
                  <CaretLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-disabled={stepPhoto(at, day.length, 1) === null ? true : undefined}
                  aria-label="Next photo"
                  className={cn(STEP_KEY, "right-3")}
                >
                  <CaretRight className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}

            <ConfirmDialog
              open={confirming}
              onClose={() => setConfirming(false)}
              title="Delete this photo?"
              line="This can’t be undone."
              confirmLabel="Delete"
              onConfirm={handleDelete}
            />
          </DialogPrimitive.Content>
        </>,
        document.body,
      )}
    </DialogPrimitive.Root>
  );
}

/** "Front · 25 Sep": the pose picked when it was added, and the day. The
 *  pose's short name, the same words its tile on the card shows (D18). */
function defaultLabel(p: ProgressPhoto): string {
  return `${poseShortLabel(p.pose)} · ${dayShort(p.date)}`;
}

/**
 * Previous and Next for assistive tech and the keyboard (cold review B35). Out
 * of sight until one takes focus, then a 44px ghost key at the photo's edge;
 * always in the accessibility tree, so VoiceOver and Switch Control reach
 * every photo of the day. Hidden by opacity rather than `sr-only`, so the key
 * has one fixed place and size, and it never takes a finger: a tap there still
 * reaches the photo underneath (`pointer-events-none`). At an end the key
 * stays (so focus is never dropped) and says it is unavailable; the live
 * region under the dots announces "Photo 2 of 5".
 */
const STEP_KEY =
  "pointer-events-none absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center " +
  "inst-ghost text-foreground opacity-0 outline-none transition-opacity duration-150 " +
  "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none " +
  "aria-disabled:text-text-muted";

/** Safari's non-standard pinch event (not in the DOM typings). */
interface SafariGestureEvent extends Event {
  scale: number;
  clientX: number;
  clientY: number;
}

/**
 * The way in: the backdrop fades up, the controls follow, and the photo grows
 * out of its tile (420ms). With no tile, or with reduced motion, it fades.
 * WAAPI keyframes carry numbers only (`var()` snaps in Safari).
 */
function animateIn(d: Dom, at: number, origin: HTMLElement | null) {
  const reduce = reduced();
  const frame = d.frames[at] ?? null;
  for (const el of [d.bg, d.top, d.bot, frame]) {
    if (!el) continue;
    el.getAnimations().forEach((a) => a.cancel());
    el.style.opacity = "";
    el.style.transition = "";
  }
  if (frame) frame.style.transform = "";
  d.bg?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 140 : 220, easing: "ease-out" });
  for (const el of [d.top, d.bot]) {
    el?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduce ? 140 : 240,
      delay: reduce ? 0 : 140,
      easing: "ease-out",
      fill: "backwards",
    });
  }
  if (!frame) return;
  if (origin && !reduce) {
    const t = rectTransform(frame.getBoundingClientRect(), origin.getBoundingClientRect());
    frame.animate(
      [
        { transform: transformCss(t), borderRadius: `${VIEWER.radius / t.s}px` },
        { transform: "none", borderRadius: `${VIEWER.radius}px` },
      ],
      { duration: VIEWER.growMs, easing: VIEWER.ease },
    );
  } else {
    frame.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: reduce ? 140 : 280, easing: VIEWER.ease },
    );
  }
}

/**
 * The way out: the photo shrinks from wherever it is (mid-swipe-down included)
 * back into its tile, while the backdrop and controls fade. With no tile, or
 * with reduced motion, it all fades.
 */
function animateOut(d: Dom, at: number, origin: HTMLElement | null): Promise<void> {
  const reduce = reduced();
  const frame = d.frames[at] ?? null;
  const anims: Animation[] = [];
  if (frame && origin && !reduce) {
    const cur = frame.getBoundingClientRect();
    frame.getAnimations().forEach((a) => a.cancel());
    frame.style.transition = "none";
    frame.style.transform = "";
    frame.style.transformOrigin = "";
    const base = frame.getBoundingClientRect();
    const from = rectTransform(base, cur);
    const to = rectTransform(base, origin.getBoundingClientRect());
    anims.push(
      frame.animate(
        [
          { transform: transformCss(from), borderRadius: `${VIEWER.radius / from.s}px` },
          { transform: transformCss(to), borderRadius: `${VIEWER.radius / to.s}px` },
        ],
        { duration: VIEWER.closeMs, easing: VIEWER.ease, fill: "forwards" },
      ),
    );
  } else if (frame) {
    anims.push(
      frame.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduce ? 120 : 200,
        easing: "ease-in",
        fill: "forwards",
      }),
    );
  }
  for (const el of [d.bg, d.top, d.bot]) {
    if (!el) continue;
    const from = Number(getComputedStyle(el).opacity);
    el.getAnimations().forEach((a) => a.cancel());
    anims.push(
      el.animate([{ opacity: Number.isFinite(from) ? from : 1 }, { opacity: 0 }], {
        duration: reduce ? 120 : el === d.bg ? VIEWER.closeMs : 160,
        easing: "ease-in",
        fill: "forwards",
      }),
    );
  }
  return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
}
