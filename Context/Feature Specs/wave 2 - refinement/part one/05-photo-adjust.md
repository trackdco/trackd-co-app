# Photo Adjust Step

## Goal
Add an adjustment step between choosing a photo and saving it, so users can line a shot up before it is committed. Today a photo goes straight from the picker or camera into the slot with no chance to correct framing. Progress photos in particular are only useful when successive shots are framed consistently, and right now that has to happen perfectly in-camera or not at all.

The reference is MacroFactor: take a photo, then nudge and scale it so the subject sits in the same place every time. Zoom and reposition only, within a fixed aspect ratio. No free cropping, no rotation, no filters.

This applies everywhere in the app that accepts a photo, not just progress photos.

Independent of the other specs. Can run in parallel with 02, 03, and 04.

## Out of Scope
- Do NOT offer free-form or custom aspect ratio cropping. The ratio is fixed per surface.
- Do NOT add rotation, straightening, filters, brightness, or any other editing tool.
- Do NOT change the pose list, the default poses, or the progress photo card layout. Those are part-two Progress work.
- Do NOT change how or where photos are stored, or their retention.
- Do NOT change the existing Photo Library / Take Photo / Choose File source menu.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions
Refer to `ui-context.md` for all styling, controls, and spacing.

**Where it applies.** Every photo entry point in the app:
- Progress photos, every pose slot
- Bloodwork attachments
- Profile picture
- Any other upload surface found during the audit in step 1

The adjust step is one implementation used by all of them, differing only in the aspect ratio passed in.

**Aspect ratio.**
- Each surface declares its own fixed ratio and the adjust step receives it as a parameter.
- Progress photos use the ratio the progress photo card already displays at, so what the user frames is what they later see.
- Profile picture uses a square, since it renders as a circle.
- Confirm the intended ratio per surface with us before implementing.

**The interaction.**
- After the photo is chosen or taken, the adjust step appears before the photo lands in its slot.
- The image can be pinched to zoom and dragged to reposition inside a fixed frame.
- The frame does not move or resize. Only the image inside it does.
- The image cannot be zoomed out past the point where it fails to fill the frame. No empty edges, no letterboxing.
- Provide guide lines inside the frame so successive shots can be aligned. Propose the guide treatment to us: a centre line, a rule of thirds grid, or a simple horizon line. Keep it faint, per the restraint rules in `ui-context.md`.
- Confirm and Cancel. Cancel returns to the source picker without saving. Confirm places the adjusted image in its slot.

**Defaults.**
- Open at the framing that fills the frame with the image centred. Do not auto-crop to a detected subject and do not apply any smart framing.
- A user who does nothing and hits Confirm gets a sensible result. The step must never be a required chore.

**Re-adjusting.** Tapping an already-filled slot reopens the adjust step on that image with its previous framing intact, rather than starting over.

**Output.** Save the adjusted result. Whether the original is also retained is a storage decision, raise it with us before choosing rather than deciding silently.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Audit and list every surface in the app that accepts a photo. Share the list and the intended aspect ratio for each before building.
2. Build the adjust step as one component, taking the image and a target ratio. Flag it first as a new shared component, per Out of Scope.
3. Implement pinch to zoom and drag to reposition, with the minimum zoom clamped so the image always fills the frame.
4. Propose the guide line treatment, get it approved, then apply it.
5. Wire it into the progress photo flow first and verify end to end.
6. Wire it into bloodwork attachments and the profile picture.
7. Implement re-adjustment of an already-filled slot with previous framing preserved.
8. Raise the original-versus-adjusted storage question and implement the agreed answer.
9. Test on both iOS Safari and Android Chrome. Pinch gestures inside a PWA are the likeliest place this breaks.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Every photo entry point audited and listed, with its aspect ratio, before building
- [ ] Adjust step flagged and approved as a new shared component
- [ ] Adjust step appears after choosing or taking a photo and before it lands in the slot
- [ ] Pinch to zoom works
- [ ] Drag to reposition works
- [ ] Image cannot be zoomed out past filling the frame, no empty edges
- [ ] Frame stays fixed, only the image moves
- [ ] No free-form or custom ratio cropping available
- [ ] No rotation, filters, or other editing tools added
- [ ] Guide lines proposed, approved, and applied faintly
- [ ] Opens centred and filling the frame with no smart framing applied
- [ ] Confirming without adjusting produces a sensible result
- [ ] Cancel returns to the source picker without saving
- [ ] Works on progress photos for every pose slot
- [ ] Works on bloodwork attachments
- [ ] Works on the profile picture at a square ratio
- [ ] Tapping a filled slot reopens the adjust step with previous framing intact
- [ ] Original-versus-adjusted storage question raised and resolved with us
- [ ] Verified on iOS Safari
- [ ] Verified on Android Chrome
- [ ] Pose list, default poses, and progress card layout unchanged
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)