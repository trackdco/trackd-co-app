# Global Sweep

## Goal
Three app-wide passes that touch many files but carry almost no logic. Remove em-dashes from user-facing copy, cut unnecessary wordiness, and lock the app to portrait orientation.

**This spec runs last in part one.** Every spec before it writes or changes copy. Sweeping first means sweeping twice, and it means new em-dashes get reintroduced by specs that were written before the rule existed. Do not start this until 01 through 06 are merged.

## Out of Scope
- Do NOT change what any string means. This is a rewrite for length and punctuation, not a change of behaviour, terminology, or instruction.
- Do NOT change any legal, medical, or safety copy without flagging it first. That includes the calculator disclaimer, the medical disclaimer, terms, and privacy. Length is not worth accuracy in those.
- Do NOT change layout, spacing, or component structure to accommodate shorter strings. If a string gets short enough that a layout looks wrong, flag it rather than adjusting the layout.
- Do NOT remove em-dashes from code, comments, variable names, or anything a user never sees.
- Do NOT rename anything or change any label that users navigate by.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

### Em-dashes

**The rule.** Em-dashes (—) and en-dashes used as em-dashes should not appear in user-facing copy unless removing one would change the meaning or break a convention.

**Legitimate exceptions**, which stay:
- Numeric and date ranges where a dash is the correct notation.
- Compound names and any string that is a proper noun or a quoted external source.
- Anywhere the character is part of data the user entered themselves. Never rewrite user content.

**How to replace, not what to replace it with mechanically.** Most em-dashes in the app are joining two clauses. Usually the right fix is a full stop and a second sentence. Sometimes a comma. Occasionally a colon, when the second half explains the first. Swapping every em-dash for a comma produces run-on sentences and is not the outcome we want. Judge each one.

Examples currently in the app, showing the shape of the fix:
- "Stop logging a compound to move it here, then reactivate to put it back — your past entries are kept." Two sentences.
- "Brighter is more recent; a site fades to empty 5 days after its last use." Semicolon here, and the clause after it is arguably not needed at all.
- "Tap a pose to take or choose a photo — fill any or all, then submit." Shorter as one instruction.

### Wordiness

**The principle.** Say the thing once. The app currently explains itself in several places where the interface is already self-evident, and some explanatory text repeats what the label above it already said.

**Where to look, in priority order:**
1. Section subtitles and helper text that restate the section title.
2. Empty states that explain the feature rather than telling the user what to do next.
3. Confirmation and warning copy, which should say what happens and nothing else.
4. Instructional text on forms where the field labels already carry the meaning.

**How to work.** Produce a table of every string you propose changing, with the current text and the proposed text side by side, before changing anything. We review the table, then you apply it. Do not sweep and show us the result, the review has to happen on the diff of the copy itself.

**Tone.** Keep the app's existing voice. It is direct and slightly dry and that is correct for this category. Do not make it clipped to the point of being cold, and do not make it chatty to compensate. Never make it coachy.

### Portrait lock

**The rule.** The app is portrait only on every device. Rotating an iPhone, an Android phone, or a tablet does not rotate the interface.

**Implementation notes.** This is a PWA, so the manifest orientation setting is the primary mechanism and it is not universally honoured, particularly on iOS Safari when the app is not installed to the home screen. Expect to need a CSS or JS fallback for the browser case.

- Set the orientation in the web app manifest.
- Add a fallback for contexts where the manifest is ignored. Propose your approach before implementing it. A rotated-device message is acceptable if genuine locking is not possible in that context, but confirm with us first.
- Do not break accessibility. Users who have set a system-level orientation preference for accessibility reasons should not be trapped. Flag it if the approach would.
- Test installed to the home screen and in-browser, on both iOS and Android.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

Do these as three separate passes. Do not interleave them.

1. **Em-dash audit.** List every user-facing string containing an em-dash, with its location and your proposed replacement. Share the list.
2. Apply the approved em-dash replacements.
3. **Wordiness audit.** Produce the current-versus-proposed table described above. Share it.
4. Apply the approved copy changes.
5. **Portrait lock.** Set the manifest orientation.
6. Propose the fallback approach for contexts that ignore the manifest, get approval, then implement it.
7. Test rotation installed to the home screen and in-browser, on iOS and Android.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Em-dash audit list shared before any change
- [ ] No em-dash remains in user-facing copy except approved exceptions
- [ ] Numeric and date ranges retain correct dash notation
- [ ] Compound names and proper nouns untouched
- [ ] No user-entered content rewritten
- [ ] Replacements judged individually, not mechanically swapped for commas
- [ ] No run-on sentences introduced
- [ ] Wordiness current-versus-proposed table shared and approved before applying
- [ ] Section subtitles that restate their title removed or shortened
- [ ] Empty states tell the user what to do next rather than explaining the feature
- [ ] Confirmation and warning copy says what happens and nothing more
- [ ] Existing voice preserved, not clipped, not chatty, not coachy
- [ ] No string's meaning changed
- [ ] Legal, medical, and safety copy left alone or flagged before touching
- [ ] Calculator disclaimer unchanged unless separately approved
- [ ] No layout or spacing adjusted to accommodate shorter strings
- [ ] Portrait orientation set in the web app manifest
- [ ] Fallback approach proposed and approved before implementation
- [ ] App stays portrait when rotated on iOS installed to home screen
- [ ] App stays portrait when rotated on iOS in-browser
- [ ] App stays portrait when rotated on Android installed to home screen
- [ ] App stays portrait when rotated on Android in-browser
- [ ] System-level accessibility orientation preferences not broken
- [ ] Three passes done separately, not interleaved
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)