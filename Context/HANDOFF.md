# Handoff prompt for a new session

Copy everything below the line into a fresh Claude Code chat.

---

I'm Adrian, the founder. You're picking up mid-build on Trackd Co. I'm out for
dinner with family, so you're working alone for a few hours. Keep going without
me.

**Read `Context/next-tasks.md` first, before anything else.** Then the other
`Context/` files in the order `CLAUDE.md` lists them.

## Where things are

Branch `wave2/containers-cycles-calendar`. **Do not merge. Do not push. `main`
stays untouched** — it deploys straight to Vercel prod. I merge everything
myself, at the end, in one go.

Wave 2 part two runs in build order, not numeric order. Done and reviewed:
containers, cycles, calendar, stacks, homepage, protocol, calculator, progress.
Next: `09-profile.md`, then `10-add-compound-item.md`, `11-log-a-dose.md`, then
part one's `07-global-sweep.md` last.

There is also a new feature in progress called **Blocks**, which is not one of
the eighteen specs. `Context/Feature Specs/proposals/blocks.md` has the design
and every decision I've settled. Finish Blocks before moving to profile.

## How I want you to work

Per spec: implement, verify (`npx tsc --noEmit`, `npm run lint`, `npm test`,
`next build`), commit, then **run an independent review agent on it**, fix what
it finds, commit again, update the context files.

**The reviews are not optional and they are not ceremony.** They have found a
real defect on every single spec so far, including two criticals and a HIGH the
author had explicitly claimed was working. Tell the agent to try to break things
and to EXECUTE the code rather than read it — every worthwhile finding so far
came from measurement, not inspection. Keep re-reviewing until there are no
highs or criticals left.

Two things to tell every review agent: put scratch files in the scratchpad, never
in `app/` (one got swept into a commit), and don't kill the dev server.

**Make the calls I'd make and keep moving.** Don't block on me. If a decision is
genuinely mine, pick the sensible default, code around it so it's cheap to
change, and write it into `Context/next-tasks.md` under the parked decisions so I
can review it when I'm back. That file is how I catch up.

**Be terse.** Short replies, plain words. No filler.

## Verifying on a real phone

`npx next dev -H 0.0.0.0`, then open the Mac's LAN address on a phone. The
unauthed dev harnesses are `/preview/recon`, `/preview/progress`,
`/preview/home`, `/preview/protocol`, `/preview/calendar`. Playwright with
`chromium.launch({ channel: "chrome" })` works for measuring things.

## Things that will bite you

- Migrations: I apply them via the Supabase MCP. Write the SQL, tell me exactly
  what to run, don't assume it's applied.
- `seedStack` is the EMPTY first-run fixture. Using it to test something means
  testing nothing.
- The `/preview/*` harnesses carry their own copies of layout padding, so a
  layout fix can measure as broken there. Check both.
- `git add -A` after an agent has been in the tree is not safe.
- No em dashes in any user-facing string. Hard rule.
- Health data is categorical, never evaluative. No red/green on a reading, no
  "on track" / "behind", no targets on biomarkers.

## When I'm back

Give me the full rundown: what you did, how to preview each thing, and every
decision you made on my behalf — the small ones too, not just the big ones.
