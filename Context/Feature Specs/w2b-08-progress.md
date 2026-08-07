# Progress

## Goal
Progress becomes the home for everything that came off the dashboard, arranged as a photo card at the top and a grid of four widgets beneath it. Photos keep their current single-image swipe treatment, gain a list of what the user was running when they were taken, and default to Front, Side and Back rather than the relaxed variants.

Depends on `05-photo-adjust.md`, `08-containers.md` and `09-homepage.md`.

## Out of Scope
- Do NOT change the progress photo viewer, its swipe behaviour, or its image treatment. Photos stay as they are today.
- Do NOT build three-up side-by-side photos. That direction was considered and dropped.
- Do NOT change the photo capture or adjust flow. That is `05-photo-adjust.md`.
- Do NOT delete any existing pose, including the relaxed variants. Only the defaults change.
- Do NOT change bloodwork storage or the consistency calculation.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Page order.** Title, photo card, then a two-by-two widget grid: Weight and Journal on the first row, Bloods and Consistency on the second. Widgets are sized like the Today and Next Dose cards on the dashboard.

**Photo card.**
- A single large photo with swipe between shots, exactly as it works now. Defaults to the most recent day's set.
- Below the photo, a **Running** section: a simple vertical list, one row per compound the user was running on that photo's date. Each row is the container icon, the compound name, and the amount.
- Styled like the calendar day sheet's running list, not as a horizontal row. This was an explicit correction, so do not build it sideways.
- The list reflects what was running **on the photo's date**, not what is running today. That is what makes it useful when scrolling back.
- If nothing was running on that date, omit the section rather than showing an empty state.

**Default poses.**
- The three defaults become **Front**, **Side** and **Back**.
- Front relaxed, Side relaxed and Back relaxed remain available as addable poses alongside every other pose.
- Existing photos already saved under the relaxed poses keep their pose and are not migrated or relabelled.

**Weight widget.** The current weight card condensed to a square. Keeps the large figure, the change beneath it, the sparkline, and the **Trend and Scale toggle**. Tapping through opens the full weight view unchanged.

**Journal widget.** Sits beside Weight, condensed to the entry date and a one-line preview of the text. The marker chips do not fit at this size and are dropped from the widget, though they remain in the journal itself. If this reads too thin in the preview, tell us and we will move Journal to a full-width card below the grid instead.

**Bloods widget.** Same behaviour as today. When empty it shows a dashed placeholder matching the existing attach treatment rather than a text-only prompt.

**Consistency widget.** Keeps the percentage, the graph and the 30D, 90D and All toggle, condensed into the widget footprint. If the toggle cannot fit legibly, propose an alternative rather than removing it.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Restructure the page into the photo card plus the two-by-two grid.
2. Confirm the photo viewer and swipe behaviour are untouched.
3. Build the Running list beneath the photo, resolving compounds against the photo's date, using containers from `08-containers.md`.
4. Omit the Running section entirely when nothing was running on that date.
5. Change the default poses to Front, Side and Back, and confirm the relaxed variants are still addable.
6. Verify existing relaxed-pose photos are unmigrated and unrelabelled.
7. Condense the Weight card to a square, keeping the Trend and Scale toggle.
8. Build the Journal widget with date and one-line preview. Share a preview before we commit to it.
9. Build the Bloods widget with the dashed empty placeholder.
10. Condense the Consistency widget, keeping the graph and range toggle.

Also, extra little note: when I'm on the journal section, for example, I'm in progress, and then I go to journal and I click today's entry, I shouldn't need to edit it. There should be a way where I can click it and view the entry, and then there's a button that says to edit it after. I don't like how, when I click my entry, it just makes me edit it, because I want to be able to actually see my entry, if that makes sense. It should be a preview, and then there is a viewing of the entry, and then you can edit later, if that makes sense. 

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Page is a photo card above a two-by-two widget grid
- [ ] Widgets sized consistently with the dashboard's Today and Next Dose cards
- [ ] Photo viewer, swipe behaviour and image treatment unchanged
- [ ] No three-up side-by-side photo layout built
- [ ] Photo card defaults to the most recent day's set
- [ ] Running list is vertical, one row per compound, with container icon, name and amount
- [ ] Running list resolves against the photo's date, not today
- [ ] Running section omitted entirely when nothing was running
- [ ] Default poses are Front, Side and Back
- [ ] Relaxed variants still available as addable poses
- [ ] Existing relaxed-pose photos unmigrated and unrelabelled
- [ ] Weight widget keeps figure, change, sparkline and Trend / Scale toggle
- [ ] Weight widget opens the full weight view unchanged
- [ ] Journal widget shows date and one-line preview
- [ ] Journal widget preview shared before commitment
- [ ] Marker chips still present inside the journal itself
- [ ] Bloods widget shows a dashed placeholder when empty
- [ ] Bloods storage unchanged
- [ ] Consistency widget keeps percentage, graph and 30D / 90D / All toggle
- [ ] Consistency calculation unchanged
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)