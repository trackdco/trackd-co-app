"use client";

import { useId, useRef, useState } from "react";
import { NumberPad, PadInput } from "@/components/feel/NumberPad";
import { formatDateKeyNumeric } from "@/lib/calendar/calendar";
import { useRouter } from "next/navigation";
import { Camera, Check, CircleNotch, Plus, X } from "@/components/icons";

import { cn } from "@/lib/utils";
import { PRESS, PRIMARY_BUTTON, ROWS } from "@/lib/ui-presets";
import { showToast } from "@/lib/toast";
import { isOverSheet } from "@/lib/feel/overlay";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { PoseIcon } from "@/components/progress/PoseIcon";
import { PosePicker } from "@/components/progress/PosePicker";
import { createClient } from "@/lib/supabase/client";
import { addProgressPhotos } from "@/app/(app)/progress/actions";
import { logWeight } from "@/app/(app)/weight/actions";
import { DropUp } from "@/components/layout/DropUp";
import { SheetDateSteps } from "@/components/layout/SheetDateSteps";
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
 * / Back up front, then any pose added from the "Add pose" card under them (the
 * catalogue, searched, or a custom name; W40) — each opens the camera / photo
 * library; fill any or all and submit them together. Photos upload client-side to the private
 * `progress-photos` bucket; one server action records all the rows for the date.
 *
 * Its frame copies `BottomSheet`'s exactly (the handle, the hairline top):
 * it cannot sit on `BottomSheet` itself yet, because Escape has to step back
 * out of the date step before it closes the sheet, and the shared frame has no
 * way to take that handler.
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
  const pickerId = useId();
  const [drawnOn, setDrawnOn] = useState(initialDate ?? todayKey);
  const [weight, setWeight] = useState("");
  /** The weight drop-up. Closed on open: this sheet leads with the photos. */
  const [weightOpen, setWeightOpen] = useState(false);
  // The weight is typed on the Trakabl pad (feel pass §3).
  const [weightPad, setWeightPad] = useState(false);
  const weightRef = useRef<HTMLButtonElement>(null);
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
      showToast("Saved");
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
        // A tap on a toast over the sheet (its Undo) is not a tap outside:
        // the sheet, and the photos in it, stay (BottomSheet's rule).
        onInteractOutside={(e) => {
          if (isOverSheet(e.target as Element | null)) e.preventDefault();
        }}
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">Add progress photos</SheetTitle>
          <SheetDescription className="sr-only">
            Add a photo for each pose and submit them together.
          </SheetDescription>

          {/* The date is the title, and it opens a month. The step machinery
              is shared with the weight sheet — `components/layout/SheetDateSteps.tsx`
              — and the rule is written up in ui-context → "when a sheet's date
              can change, the date IS the title". */}
          <SheetDateSteps
            label="Progress photos"
            value={drawnOn}
            onChange={setDrawnOn}
            todayKey={todayKey}
            step={dateStep}
            onStepChange={setDateStep}
          >
            {/* One box for the step's contents, so each section rises in as
                the sheet lands (feel pass §4). The date title lands with the
                sheet. */}
            <div data-sheet-body>
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
                            PRESS.card,
                            "flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-xl border transition-colors",
                            att
                              ? "border-accent-primary/50"
                              : "border-border-default bg-bg-input/40 text-text-muted hover:bg-bg-input/70",
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
                            className={cn(
                              PRESS.icon,
                              "absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-base/80 text-text-primary before:absolute before:-inset-2.5 before:content-['']",
                            )}
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
              </div>

              {/* ADD POSE, A LONG CARD UNDER THE PHOTOS (Adrian's walk, W40).
                  It was a sixth tile in the row, with the search showing under
                  it. Now the search shows only once you ask to add a pose: the
                  card opens in place (the app's `.fold`, 420ms open, 280ms
                  shut), its plus turns to a cross, and the search and the
                  poses rise in one after another. Closed, what it holds is
                  out of reach (`inert`). One child inside `ROWS`, so the
                  card's own divider never draws a line under a shut fold. */}
              <div data-dropup-open={pickerOpen} className={cn(ROWS, "mt-4 overflow-hidden")}>
                <div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen((o) => !o)}
                    aria-expanded={pickerOpen}
                    aria-controls={pickerId}
                    className={cn(
                      PRESS.card,
                      "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                    )}
                  >
                    <span
                      aria-hidden
                      // The 10px a "+" is drawn at (CardPlus), inline because
                      // `.inst-ghost` sets its own 9px.
                      style={{ borderRadius: "var(--r-lg)" }}
                      className="inst-ghost flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
                    >
                      <Plus
                        className={cn(
                          "h-4 w-4 transition-transform duration-300 ease-motion motion-reduce:transition-none",
                          pickerOpen && "rotate-45",
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-foreground">Add pose</span>
                  </button>
                  <div
                    id={pickerId}
                    className="fold"
                    data-open={pickerOpen ? "true" : "false"}
                    inert={!pickerOpen}
                  >
                    <div>
                      <div className="fold-body hairline-t px-2 pt-2 pb-2">
                        <PosePicker bare exclude={slots} onPick={addPose} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
              <div className="block">
                <PadInput
                  value={weight}
                  label={`Weight in ${unit}`}
                  unit={unit}
                  active={weightPad}
                  onOpen={() => setWeightPad(true)}
                  inputRef={weightRef}
                  className="h-12 w-full text-sm"
                  suffix={<span className="shrink-0 font-sans text-sm text-text-muted">{unit}</span>}
                />
                <span className="mt-1 block text-xs text-text-muted">
                  Saved as your weight for this date.
                </span>
              </div>
              <NumberPad
                active={weightPad ? 0 : null}
                fields={[
                  {
                    id: "weight",
                    // The sheet's title (the date) sits under the pad, so a
                    // back-dated weight names its day here.
                    label:
                      drawnOn === todayKey
                        ? "Today’s weight"
                        : `Weight for ${formatDateKeyNumeric(drawnOn)}`,
                    unit,
                    value: weight,
                    onChange: (v) => {
                      setWeight(v);
                      if (error) setError(null);
                    },
                    sanitize: sanitizeWeightInput,
                  },
                ]}
                onActiveChange={() => {}}
                onClose={() => setWeightPad(false)}
                anchorRef={weightRef}
                returnFocusRef={weightRef}
                label="Weight"
              />
              </DropUp>

              {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
              <div className="h-2" />
            </div>
          </SheetDateSteps>

          {/* Action bar. ONE control (Adrian, 2026-09-11): Cancel was removed,
              so Save has the whole bar. Dismissal is the grab handle, a drag
              down, the scrim, or Escape, which is how every other sheet in the
              app is already dismissed. */}
          <div className="flex shrink-0 gap-2 px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleSave}
              // No photo yet is not a dead Save: tapping it says "Add at least
              // one photo." The calendar step has its own way back.
              disabled={busy || dateStep}
              className={cn(PRIMARY_BUTTON, "flex-1")}
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
