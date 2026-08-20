# Signed copy

Text in this directory is **the founder's own words, pasted verbatim**, one string
per line. It is the reference `lib/billing/signedCopyPin.test.ts` diffs the
rendered output against, **codepoint for codepoint**.

A fix WITHHOLDS a line. It never rewords one.

| file | surface |
|---|---|
| `manage-summary.txt` | `/billing/manage`'s one-sentence summary, per state (08 §3.3) |
| `read-only-popup.txt` | the read-only pop-up (05 §3.6, D98) |
| `beta-notice.txt` | the beta grace notice (06) |
| `past-due-banner.txt` | the declined-payment dashboard banner (Group D) |

## ⚠️ What decides which signed strings get a machine check

**Every one of them.** A signed string that is rendered to a user gets a pin. If it
cannot be reached from `lib/`, **moving it into `lib/` is the first half of the fix**
— it is never a reason to skip the pin.

That rule is written down because the opposite happened twice in one batch, silently,
and a cold review found it by mutation rather than by reading:

- the pop-up's first clause was reworded **twice** (D98), was wrong once, and lived as
  JSX text in `components/`. `vitest.config.ts` includes the `lib/**` tests and nothing
  else, so reverting it to the wording D98 had ruled false left **all 1573 tests
  green**.
- `/billing`'s **"Renews on" / "Ends on"** verb — the last step of a decision four
  separate fixes went into, and a claim about what happens next — was a ternary inside
  a page component. Also unreachable, also unpinned.

Both moved (`lib/billing/readOnlyCopy.ts`, `manage.ts#periodEndLabelFor`) and both are
pinned.

## How a pin must be built

1. **Read the value that reaches the screen** — a pure function's return, or a copy
   constant the component interpolates. Never the component's source, and never a
   regex over prose. A source assertion may sit *beside* a value pin to prove the
   component still renders from it; it never replaces one.
2. **Diff codepoints and name the first difference.** `toBe` on a long string prints
   two walls of text; `firstDifference` prints `index 47 is U+2019 and should be
   U+0027`. A curly apostrophe, a non-breaking space and an em dash have all shipped
   here before.
3. **Strip comments before any source assertion.** These files legitimately NAME the
   wordings they replaced, and a raw substring test reads those as the code.
4. **Give it a control that can actually fail**, and say plainly what the pin does
   *not* prove. A pin that cannot fail is an assertion that the world exists.

## Adding one

Add the string to a pure module under `lib/billing/`, add its line here, add it to
`signedCopyPin.test.ts`, then **prove the pin fails**: change one character, run
`npx vitest run`, and put it back.
