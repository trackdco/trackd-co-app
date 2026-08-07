# Sex-Specific Markers

## Goal
The injection site body map already changes with the sex set in the user's profile. The markers list does not. All 36 markers are offered to everyone, including several that only apply to one sex. This spec applies the same logic to markers that already governs the body map SVG.

The important constraint is that filtering affects what a user can log going forward. It must never hide, alter, or delete anything already logged. A user who changes their profile sex keeps every marker entry they have ever recorded.

Depends on `01-dose-integrity.md` being merged. Independent of specs 02 and 03.

## Out of Scope
- Do NOT change how markers are logged, displayed on a day, or charted. Only which ones appear in the picker changes.
- Do NOT add, remove, or invent markers beyond the rename called out below.
- Do NOT redesign the markers UI or its layout.
- Do NOT touch the injection site body map. It already works correctly and is the reference behaviour, not a target.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**The split.** Every marker carries an applicability of shared, male, or female.

*Male only (2):*
- Erection Quality
- Gyno Symptoms

*Female only (3):*
- Clitoral Enlargement
- Voice Deepening
- Cycle Changes (see the rename below)

*Shared (31):* Energy, Libido, Sleep Quality, Mood, Pumps, Strength, Recovery, Motivation, Focus, Vascularity, Muscle Fullness, Appetite, Aggression, Water Retention, Acne, Night Sweats, Joint Pain, Bloating, Injection Site Pain, Insomnia, Irritability, Back Pumps, Anxiety, Headaches, Oily Skin, Breathlessness, Hand Tremors, Muscle Cramps, Hot Flushes, Hair Shedding, Facial / Body Hair.

Two notes on the shared list, since these are the judgement calls. **Hair Shedding** and **Facial / Body Hair** stay shared deliberately: both sexes track them, for opposite reasons, and restricting either would remove a genuinely useful marker from half the users. **Hot Flushes** stays shared for the same reason.

**Rename required.** "Cycle Changes" collides with the Cycles feature being built later, where a cycle means a compound run with on and off periods. Two different meanings of "cycle" in one app is the same mistake we are already fixing with "stack". Propose a replacement name to us and get it approved before implementing. Do not ship the collision.

**Filtering behaviour.**
- The marker picker shows shared markers plus the markers matching the sex set in the user's profile.
- Markers for the other sex are not shown, not greyed out, and not listed as unavailable.
- If the profile has no sex set, show shared markers only. Do not guess and do not default to male.

**History is never filtered.**
- Any marker the user has already logged remains visible in history, on past days, in the calendar day sheet, and in any chart or trend view, regardless of the current profile sex.
- Changing profile sex changes the picker only. It never removes, hides, or rewrites a logged entry.
- If a user has an active or in-progress entry for a marker that filtering would remove, that entry is preserved.

**Changing sex mid-use.** No warning, no confirmation, no prompt about markers. The change is not destructive so it does not need one. It takes effect on the next time the picker opens.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Find where the injection site body map reads profile sex and reuse that same source of truth. Do not introduce a second way of reading it.
2. Add an applicability field to the marker definitions and populate it per the split above.
3. Propose the replacement name for "Cycle Changes", get it approved, then apply it including any migration of existing logged entries under the old name.
4. Filter the marker picker by shared plus the profile sex, with shared-only as the fallback when no sex is set.
5. Verify that history rendering paths do not apply the filter. Check every surface that displays a logged marker.
6. Test the change-sex path end to end with markers already logged under the previous setting.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Profile sex read from the same source the body map already uses
- [ ] Applicability field added and populated for all 36 markers
- [ ] Erection Quality and Gyno Symptoms appear for male only
- [ ] Clitoral Enlargement, Voice Deepening, and the renamed Cycle Changes appear for female only
- [ ] All 31 shared markers appear for both
- [ ] Hair Shedding, Facial / Body Hair, and Hot Flushes confirmed shared
- [ ] Replacement name for "Cycle Changes" proposed and approved before implementing
- [ ] Existing entries logged under the old name migrated to the new name
- [ ] No two meanings of "cycle" remain in user-facing strings
- [ ] Non-applicable markers are absent, not greyed out or listed as unavailable
- [ ] Profile with no sex set shows shared markers only and does not default to male
- [ ] Previously logged markers still visible in history after a sex change
- [ ] Previously logged markers still visible on past days and in the calendar day sheet
- [ ] Previously logged markers still visible in any chart or trend view
- [ ] No logged marker entry deleted, hidden, or rewritten by a sex change
- [ ] No warning or confirmation prompt added to the sex change
- [ ] Injection site body map untouched
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)