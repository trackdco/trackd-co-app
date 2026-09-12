"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CaretDown, CaretLeft, Check, CircleNotch, Plus, X } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { PoseIcon } from "@/components/progress/PoseIcon";
import { PosePicker } from "@/components/progress/PosePicker";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/client";
import { addProgressPhotos } from "@/app/(app)/progress/actions";
import { logWeight } from "@/app/(app)/weight/actions";
import { DropUp } from "@/components/layout/DropUp";
import { formatDateKeyNumeric } from "@/lib/calendar/calendar";
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel";
import { DEFAULT_POSES, poseLabel, poseShape } from "@/lib/progress/photos";
import {
  PhotoAdjustSheet,
  type PhotoAdjustResult,
} from "@/components/media/PhotoAdjustSheet";
import { PROGRESS_PHOTO_ASPECT, type Framing } from "@/lib/media/framing";
import {
  formatWeight,
  sanitizeWeightInput,
  unitToKg,
  type WeightUnit,
} from "@/lib/weight";

const MAX_BYTES = 10 * 1024 * 1024;
/** The two steps sit in the same box, one on top of the other. Absolute, so the
 *  outgoing one does not keep the box its own height on the way out. */
const STEP_PANE =
  "absolute inset-x-0 top-0 px-6 transition-[transform,opacity] " +
  "duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

interface Attachment {
  pose: string;
  /** The ADJUSTED image — what gets uploaded (storage is adjusted-only). */
  file: File;
  previewUrl: string;
  /** The untouched pick, kept in memory for this session only, so re-opening the
   *  slot re-adjusts the full photo instead of a crop of a crop. */
  original: File;
  /** The framing that produced `file`, so re-opening resumes where it left off. */
  framing: Framing;
}

/**
 * Add a progress-photo SESSION (Spec 09 addendum). A tile per pose — Front / Side
 * / Back relaxed up front (+ more from the catalogue or custom) — each opens the
 * camera / photo library; fill any or all, add an optional note about the
 * physique, and submit them together. Photos upload client-side to the private
 * `progress-photos` bucket; one server action records all the rows for the date.
 */
export function AddProgressPhotoSheet({
  open,
  onOpenChange,
  userId,
  todayKey,
  customPoses,
  initialDate,
  unit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  todayKey: string;
  customPoses: string[];
  initialDate?: string;
  /** The user's display weight unit (kg/lbs) for the optional weight field. */
  unit: WeightUnit;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingPose = useRef<string | null>(null);
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});
  const [extraPoses, setExtraPoses] = useState<string[]>(customPoses);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawnOn, setDrawnOn] = useState(initialDate ?? todayKey);
  const [weight, setWeight] = useState("");
  /** The weight drop-up. Closed on open: this sheet leads with the photos. */
  const [weightOpen, setWeightOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The pose whose photo is mid-adjustment, with the image being framed. Null =
  // no adjust step open.
  const [adjusting, setAdjusting] = useState<{
    pose: string;
    file: File;
    framing?: Framing;
  } | null>(null);

  /** Which step is showing: the poses, or the calendar behind the title. */
  const [dateStep, setDateStep] = useState(false);
  const dateValueRef = useRef<HTMLSpanElement>(null);
  /** Whether the day just picked was a different one — the title only beats if
   *  something actually changed. */
  const dateChanged = useRef(false);
  /**
   * The panes are held in STATE, not in a ref, and that is the difference
   * between this working and silently collapsing.
   *
   * Radix mounts this subtree into a portal, and a `useRef` holding it does not
   * re-run the effect below when the node finally attaches — so the measure ran
   * against `null`, the box kept `height: auto`, and a box whose children are
   * all absolutely positioned computes that as ZERO. The sheet opened showing
   * its header and its Save bar with nothing in between. A callback ref fires
   * exactly when the node arrives.
   */
  const [posesPane, setPosesPane] = useState<HTMLDivElement | null>(null);
  const [calPane, setCalPane] = useState<HTMLDivElement | null>(null);
  const [stepHeight, setStepHeight] = useState<number>();

  /**
   * The box takes the height of whichever step is showing, so the sheet EASES
   * to fit the calendar instead of jumping to it.
   *
   * A `ResizeObserver` rather than a one-off measure: the poses step grows and
   * shrinks on its own (the pose picker, the weight drop-up, an error line), and
   * a height measured once would clip all three. It watches the active pane
   * only, whose height is content-driven and independent of the box's, so there
   * is no loop to fall into.
   */
  useLayoutEffect(() => {
    const pane = dateStep ? calPane : posesPane;
    if (!pane) return;
    const sync = () => setStepHeight(pane.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(pane);
    return () => ro.disconnect();
  }, [dateStep, posesPane, calPane]);

  function handleDatePick(key: string) {
    dateChanged.current = key !== drawnOn;
    setDrawnOn(key);
  }

  /** The calendar has had its beat: step back, and let the new date arrive in
   *  the title. Restarted by class, not by `key` — see `globals.css`. */
  function handleDateSettled() {
    setDateStep(false);
    const el = dateValueRef.current;
    if (!el || !dateChanged.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("animate-date-value");
    void el.offsetWidth;
    el.classList.add("animate-date-value");
  }

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      for (const a of Object.values(attachments)) URL.revokeObjectURL(a.previewUrl);
      setAttachments({});
      setExtraPoses(customPoses);
      setPickerOpen(false);
      setDrawnOn(initialDate ?? todayKey);
      setDateStep(false);
      setWeight("");
      setError(null);
      // Otherwise closing the sheet mid-adjust and reopening it would land you
      // straight back in the adjust step, on a photo from the previous session.
      setAdjusting(null);
    }
  }

  const slots = [
    ...DEFAULT_POSES.map((p) => p.id),
    ...extraPoses,
  ];

  function pickFor(pose: string) {
    pendingPose.current = pose;
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    const pose = pendingPose.current;
    pendingPose.current = null;
    if (!f || !pose) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image (a photo).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That photo is over 10 MB.");
      return;
    }
    setError(null);
    // Adjust BEFORE it lands in the slot (Spec 05) — successive shots are only
    // comparable if they're framed the same, and that can't be fixed after upload.
    setAdjusting({ pose, file: f, framing: undefined });
  }

  /** Re-open a filled slot on its ORIGINAL image with its previous framing, so
   *  adjusting twice doesn't compound crops. */
  function readjust(pose: string) {
    const att = attachments[pose];
    if (!att) return;
    setAdjusting({ pose, file: att.original, framing: att.framing });
  }

  function onAdjusted(result: PhotoAdjustResult) {
    const pose = adjusting?.pose;
    setAdjusting(null);
    if (!pose) return;
    setAttachments((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose].previewUrl);
      return {
        ...prev,
        [pose]: {
          pose,
          file: result.file,
          previewUrl: URL.createObjectURL(result.file),
          original: result.original,
          framing: result.framing,
        },
      };
    });
  }

  function removeAttachment(pose: string) {
    setAttachments((prev) => {
      const next = { ...prev };
      if (next[pose]) URL.revokeObjectURL(next[pose].previewUrl);
      delete next[pose];
      return next;
    });
  }

  function addPose(p: string) {
    setExtraPoses((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setPickerOpen(false);
  }

  async function handleSave() {
    const atts = Object.values(attachments);
    if (atts.length === 0) {
      setError("Add at least one photo.");
      return;
    }
    // Optional weight — logged for THIS session's date so it links to the photos.
    // Validate the format/range before uploading anything.
    let weightKg: number | null = null;
    if (weight.trim() !== "") {
      /**
       * ⚠️ OPEN THE PANEL FOR **ANY** WEIGHT ERROR, not for one branch of it.
       *
       * The first version guarded only the `!Number.isFinite` branch, which is
       * the branch almost nobody reaches: `sanitizeWeightInput` already strips
       * everything except digits and a single dot, so the only input that
       * survives it and is still not a number is a bare ".". The branch a real
       * typo lands on is the range check below, and that one left the panel
       * shut. A user who typed 20, collapsed the panel to see their photos, and
       * hit Save got "Enter a weight between 30 kg and 300 kg" with no weight
       * field anywhere on screen, and Save failing identically every retry.
       *
       * Which made the rule this same change wrote into ui-context.md — "an
       * error inside a closed panel opens it first" — true on the unreachable
       * path and false on the reachable one. Hoisted so it cannot drift apart
       * again: whatever is wrong with the weight, the weight is shown.
       */
      const rejectWeight = (message: string) => {
        setWeightOpen(true);
        setError(message);
      };
      const num = Number(weight);
      if (!Number.isFinite(num)) {
        rejectWeight("Enter a valid weight, or leave it blank.");
        return;
      }
      const kg = unitToKg(num, unit);
      if (kg < 30 || kg > 300) {
        rejectWeight(
          `Enter a weight between ${formatWeight(30, unit)} and ${formatWeight(
            300,
            unit,
          )} ${unit}, or leave it blank.`,
        );
        return;
      }
      weightKg = kg;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      const items: { pose: string; storagePath: string }[] = [];
      for (const a of atts) {
        const ext = EXT[a.file.type] ?? "img";
        const path = `${userId}/${randomId()}/photo.${ext}`;
        const up = await supabase.storage
          .from("progress-photos")
          .upload(path, a.file, { contentType: a.file.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        uploaded.push(path);
        items.push({ pose: a.pose, storagePath: path });
      }
      // Notes were removed from this sheet (Adrian, 2026-09-11). The ARGUMENT
      // stays: `progress_photos.note` still holds every note already written,
      // and `ProgressPhotoViewer` and `EditDaySheet` still render them. Dropping
      // the column or the parameter would delete other people's writing to tidy
      // up a form.
      const res = await addProgressPhotos(drawnOn, "", items);
      if (!res.ok) throw new Error(res.error ?? "Couldn't save. Try again.");
      // Log the weight for this date too (best-effort — the photos are saved).
      if (weightKg != null) await logWeight(weightKg, drawnOn);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (uploaded.length) await supabase.storage.from("progress-photos").remove(uploaded);
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const count = Object.keys(attachments).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-desktop="rail"
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
        // Escape unwinds one step at a time: out of the calendar first, and only
        // then out of the sheet. Closing the whole thing from the date step
        // would throw away photos already attached.
        onEscapeKeyDown={(e) => {
          if (!dateStep) return;
          e.preventDefault();
          setDateStep(false);
        }}
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">Add progress photos</SheetTitle>
          <SheetDescription className="sr-only">
            Add a photo for each pose and submit them together.
          </SheetDescription>

          {/*
            THE DATE IS THE TITLE, AND THE TITLE OPENS (Adrian, 2026-09-11 from a
            four-variant prototype, after a screenshot of another app's picker:
            "make the date there but incorporate it like this app"; then "do A
            but add animations").

            It replaced a read-only "Dated today" line, which itself replaced an
            `<input type="date">`. The line was honest and unreachable: a
            back-dated session could be READ but not changed, so the only way to
            file a photo to the right day was to start again from the day editor.
            As the title, the date is both the statement and the control.

            Two layers in one slot, crossfading past each other in the direction
            of travel, so the header moves WITH the step rather than being
            swapped under it. The hidden layer is `inert`: a control you cannot
            see must not be tabbable.
          */}
          <div className="relative h-[4.125rem] shrink-0 px-6">
            <div
              inert={dateStep}
              className={cn(
                "absolute inset-x-0 top-0 flex flex-col items-center transition-[transform,opacity] duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none",
                dateStep && "pointer-events-none -translate-x-[26px] opacity-0",
              )}
            >
              <button
                type="button"
                onClick={() => setDateStep(true)}
                aria-expanded={dateStep}
                aria-label={`Change the date — currently ${formatDateKeyNumeric(drawnOn)}`}
                className="flex min-h-11 items-center gap-2 rounded-xl px-3 outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent-amber/50 active:scale-[0.98]"
              >
                <span
                  ref={dateValueRef}
                  className="font-mono text-[17px] tracking-[-0.01em] text-foreground"
                >
                  {formatDateKeyNumeric(drawnOn)}
                </span>
                <CaretDown className="h-3.5 w-3.5 text-text-subtle" aria-hidden />
              </button>
              <span className={cn(CARD_EYEBROW, "-mt-0.5")}>Progress photos</span>
            </div>

            <div
              inert={!dateStep}
              className={cn(
                "absolute inset-0 flex items-center px-6 transition-[transform,opacity] duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none",
                !dateStep && "pointer-events-none translate-x-[26px] opacity-0",
              )}
            >
              <button
                type="button"
                onClick={() => setDateStep(false)}
                className="-ml-2 flex min-h-11 items-center gap-1 rounded-xl pr-3 pl-2 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-amber/50"
              >
                <CaretLeft className="h-4 w-4" aria-hidden />
                Back
              </button>
              <span className={cn(CARD_EYEBROW, "ml-auto")}>Select date</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* The box eases to the height of the step showing. `overflow-hidden`
                is what keeps the step sliding out from widening the sheet — the
                scroll parent would otherwise gain a horizontal scrollbar for the
                length of the transition. */}
            <div
              style={{ height: stepHeight }}
              className="relative overflow-hidden transition-[height] duration-[var(--motion-slow)] ease-motion motion-reduce:transition-none"
            >
            <div
              ref={setPosesPane}
              inert={dateStep}
              className={cn(
                STEP_PANE,
                dateStep && "pointer-events-none -translate-x-[30%] opacity-0",
              )}
            >
            <p className="text-xs text-text-muted">
              Tap a pose to add a photo. Fill any or all.
            </p>

            {/* Pose circles — tap to take or choose a photo for each. Compact so
                the sheet stays short instead of scrolling. */}
            <div className="mt-4 flex flex-wrap gap-3">
              {slots.map((pose) => {
                const att = attachments[pose];
                const shape = poseShape(pose);
                return (
                  <div
                    key={pose}
                    className="animate-shortcut-in flex w-[4.5rem] flex-col items-center gap-1.5"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        // A FILLED slot re-opens the adjust step on the original
                        // with its framing intact (Spec 05) — re-framing is the
                        // common intent; swapping the photo entirely is the X.
                        onClick={() => (att ? readjust(pose) : pickFor(pose))}
                        aria-label={`${att ? "Adjust" : "Add"} ${poseLabel(pose)} photo`}
                        className={cn(
                          "flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border transition-colors",
                          att
                            ? "border-accent-primary/50"
                            : "border-dashed border-border-strong bg-bg-input/40 text-text-muted hover:bg-bg-input/70",
                        )}
                      >
                        {att ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={att.previewUrl} alt="" className="h-full w-full object-cover object-top" />
                        ) : shape ? (
                          <PoseIcon shape={shape} className="h-9 w-7" />
                        ) : (
                          <Camera className="h-6 w-6" aria-hidden />
                        )}
                      </button>
                      {att && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(pose)}
                          aria-label={`Remove ${poseLabel(pose)} photo`}
                          className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-base/80 text-text-primary"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                    <span className="text-center text-[11px] leading-tight text-text-muted">
                      {poseLabel(pose)}
                    </span>
                  </div>
                );
              })}

              {/* Add a pose. */}
              <div className="flex w-[4.5rem] flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                  aria-label="Add a pose"
                  className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-border-default bg-bg-surface-raised text-text-muted transition-colors hover:text-foreground"
                >
                  <Plus className="h-6 w-6" aria-hidden />
                </button>
                <span className="text-center text-[11px] leading-tight text-text-muted">
                  Add pose
                </span>
              </div>
            </div>

            {pickerOpen && (
              <div className="animate-shortcut-in mt-3">
                <PosePicker exclude={slots} onPick={addPose} />
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic"
              onChange={onFile}
              className="hidden"
            />

            {/* WEIGHT, BEHIND A DROP-UP (Adrian, 2026-09-11).
                The mirror of what "Log weight" now does with photos, and
                deliberately symmetric: each sheet leads with the thing it is
                named after and folds the other away. Still logged for the date
                in the title, so it still links to these photos — which is why
                the label stops saying "today" the moment that date is not. */}
            <DropUp
              label={
                drawnOn === todayKey ? "Log today’s weight" : "Log weight for this date"
              }
              open={weightOpen}
              onOpenChange={setWeightOpen}
            >
            <label className="block">
              <div className="relative">
                <Input
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => {
                    setWeight(sanitizeWeightInput(e.target.value));
                    if (error) setError(null);
                  }}
                  placeholder="0"
                  aria-label={`Weight in ${unit}`}
                  className="h-12 rounded-xl border-border-default bg-bg-input pr-14 font-mono text-sm dark:bg-bg-input"
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
                  {unit}
                </span>
              </div>
              <span className="mt-1 block text-xs text-text-subtle">
                Saved as your weight for this date.
              </span>
            </label>
            </DropUp>

            {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
            <div className="h-2" />
            </div>

            <div
              ref={setCalPane}
              inert={!dateStep}
              className={cn(
                STEP_PANE,
                !dateStep && "pointer-events-none translate-x-full opacity-0",
              )}
            >
              <DatePickerPanel
                value={drawnOn}
                todayKey={todayKey}
                active={dateStep}
                onPick={handleDatePick}
                onSettled={handleDateSettled}
              />
              <div className="h-2" />
            </div>
            </div>
          </div>

          {/* Action bar. ONE control (Adrian, 2026-09-11): Cancel was removed,
              so Save has the whole bar. Dismissal is the grab handle, a drag
              down, the scrim, or Escape, which is how every other sheet in the
              app is already dismissed. */}
          <div className="flex shrink-0 hairline-t px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || count === 0 || dateStep}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {busy ? "Saving…" : count > 1 ? `Save ${count} photos` : "Save"}
            </button>
          </div>
        </div>
      </SheetContent>

      {/* Adjust — sits between choosing the photo and it landing in the slot.
          Progress photos frame at 3:4, the ratio the card and the compare sheet
          already render at, so what you frame is what you later see. */}
      <PhotoAdjustSheet
        open={adjusting !== null}
        file={adjusting?.file ?? null}
        aspect={PROGRESS_PHOTO_ASPECT}
        initialFraming={adjusting?.framing}
        onCancel={() => setAdjusting(null)}
        onConfirm={onAdjusted}
      />
    </Sheet>
  );
}
