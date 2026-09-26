# Markers: how they are meant to look (from the final-check page)

Written by the design chat on 26 Sep 2026 for the builder (Adrian pasted it in). All the values come from the page's own
source in `~/trakabl-mockups/final-check/r6/`: `markers8.js` for the picker and rows, `markers7.js` for Create your own,
`markers6.js` for the drag and wiring, and `extra8.css`. Copy from there, do not rebuild from memory. The reference
renders are section 4 of round three (Version 4) and the Home phone's journal in the current version of
https://claude.ai/artifact/2Mnj2qS3FKxiSNsNPjxiv1.

Suggested markers (Adrian, 26 Sep): Energy, Libido, Sleep quality, Mood, Pump strength, Recovery, Motivation.

## The vibe
Calm and monochrome: white on near-black, no category colours anywhere in markers. Everything is a small rounded
rectangle, with a lot of quiet space. The only thing that "lights up" is what you've chosen, and it goes white.

## Where it sits
In the journal's inset panel: a darker well with radius 14, background a gradient from `--bg-inset-deep` to
`--bg-inset`, and an inner shadow `inset 0 2px 6px rgba(0,0,0,.45)`. One header row, "Markers" at 12.5px on the left and
the close arrow on the right, with no empty band above. The arrow is a 30px rounded square (radius 9) on
`--bg-surface-raised`.

## Before any are added
- "Use my last": a full-width ghost button (raised grey, radius 9 to 10, about 9px tall padding, 12px text). A small
  circular-arrows icon sits on the left and the count ("4") in muted grey on the right.
- Search: a field on `--bg-input`, radius 12, a 14px muted magnifier, 12.5px text, placeholder "Search 33 markers". Its
  focus ring sits INSIDE the field (1.2px, muted), so it never clips.
- "YOURS" (with "Edit" on the right) and "SUGGESTED": tiny uppercase eyebrows, about 9px, tracked wide, muted.
- Chips: raised grey, radius 8, padding about 5x9, 11px text, a thin + icon before the name, 6px gaps, wrapping. A ticked
  chip turns solid white with dark text, and the + becomes a small tick. It pops as it ticks: scale .92 -> 1.04 -> 1
  over 260ms, springy.
- "Create your own": a small outlined button (1px border in `--border-strong`, radius 9, 11.5px, with a + icon).
- Once something is ticked, a full-width white "Add N" button rises in at the bottom of the panel (8px up and fading in,
  260ms) and stays pinned there.

## After Add: the rows
- The rows arrive one after another: each rises 8px and fades in over 320ms, 60ms apart.
- Each row has a top line: the name at 12px on the left (a muted "yours" tag if it's a custom marker), and the level
  word on the right. The word is white once rated and a muted "Not rated" before. That line is padded right by 34px so
  it lines up with the x column.
- The steps are five equal bars, 22px tall, radius 7, 4px apart:
  - Empty bars are raised grey. There's no thumb or highlight until you rate.
  - Rated bars fill WHITE up to your level, with a brightness ramp: the leftmost filled bar is dimmest, the chosen one
    full white and slightly enlarged (scale 1.08).
  - Changes ease over about 180ms, and the enlarge has a soft spring (250ms).
  - You can drag across the bars or tap one. Tapping the chosen bar again clears it.
  - When the word changes it pops up 4px and fades in (200ms).
- The x: a 24px rounded square on raised grey at 45% opacity, centred beside the bars. Removing a marker shows the bottom
  toast "<Marker> removed" with Undo.
- Rows are 16px apart. Under them, two quiet text links in muted grey at 11.5px, 14px apart: "+ Add more markers" and
  "Use my last" (with the circular-arrows icon).

## Create your own
- A header row: "Cancel" (or "Back"), muted, on the left and "New marker" in the middle. Under it, 2 or 3 thin progress
  dashes (3px) that fill white step by step.
- The steps slide sideways as you move: 14px with a fade, about 120ms out and 240ms in.
- "Name it": a light 15px title, a field (radius 12), and a white "Next" button.
- "Pick its steps": option cards on raised grey (radius 12). Each shows a mini five-bar preview, with the first three
  white fading up in brightness, and its words in small muted text underneath. The selected card gets a 1.5px white
  inner ring.

## In the new look
The same shapes and ramp, in IBM Plex: the words are Plex Sans and any figures Plex Mono. The well, buttons and chips
take the Instrument presets: slightly engraved edges and the deeper black grounds. The white stays #F5F3F0.
