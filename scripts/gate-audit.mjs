/**
 * Regenerate `lib/billing/gate.ts`'s coverage list FROM THE CODE.
 *
 * The hand-written version was wrong in both directions and a cold review found
 * it. Parses each exported async function's own body rather than grepping the
 * file, because the guard text is identical everywhere and a grep cannot tell
 * which function it belongs to — a mistake that has already been made once, and
 * silently un-gated `startBlock` inside the commit that fixed it.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["lib/db", "lib/home", "lib/notifications", "lib/push", "app"];
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith(".") && e.name !== "node_modules") walk(p); }
    else if (/\.tsx?$/.test(p) && !/\.test\.ts$/.test(p)) files.push(p);
  }
};
for (const r of ROOTS) { try { statSync(r); walk(r); } catch {} }

const gated = {}, partly = {}, open_ = {};
for (const f of files) {
  const s = readFileSync(f, "utf8");
  if (!/^\s*["']use server["']/m.test(s)) continue;
  const starts = [...s.matchAll(/export async function (\w+)\(/g)].map((m) => [m.index, m[1]]);
  starts.forEach(([pos, name], i) => {
    const end = i + 1 < starts.length ? starts[i + 1][0] : s.length;
    const body = s.slice(pos, end);
    // ⚠️ THREE GUARD FORMS, and missing one silently un-gates sixteen functions.
    // `refuseWrite()` is the widened guard from 05 §3.9 / Q85 — it replaced
    // `canWriteData()` at every call site that returns a refusal shape, and until
    // this pattern knew about it those sixteen reported as NOT GATED. A list that
    // is subtly wrong is worse than no list, which is why this script exists.
    const GUARD = /canWriteData\(\)|requireWriteAccess\(\)|refuseWrite\(\)/;
    const isGated = GUARD.test(body);
    // A guard can be CONDITIONAL — `setProtocolCompoundActive` gates the re-add
    // and lets the delete through, because one function serves both directions.
    // Reported as its own bucket rather than as "gated": a reader who takes
    // "gated" to mean "always refuses" would be wrong about half the calls.
    //
    // Two shapes now. The inline one puts the whole condition on the guard's own
    // line (`if (isActive && !(await canWriteData()))`); the widened one nests the
    // guard inside a block (`if (!isDelete) { const refused = ... }`), so it is
    // detected by INDENTATION instead — a guard deeper than the function's body
    // level is inside something.
    const lines = body.split("\n");
    const guardLine = lines.find((l) => GUARD.test(l)) ?? "";
    const inlineConditional = /&&|\|\|/.test(guardLine.split("//")[0]);
    const nested = (guardLine.match(/^\s*/)?.[0].length ?? 0) > 2;
    const conditional = inlineConditional || nested;
    const bucket = isGated ? (conditional ? partly : gated) : open_;
    bucket[f] ??= [];
    bucket[f].push(name);
  });
}
const n = (o) => Object.values(o).flat().length;
const show = (label, o) => {
  console.log(`${label} (${n(o)}):`);
  for (const [f, fns] of Object.entries(o).sort()) console.log(`  ${f.padEnd(34)} ${fns.join(", ")}`);
};

/* ── the CHECK (05 §3.10) ─────────────────────────────────────────── */

/**
 * ⚠️ AN UNGATED WRITE IS A BUILD FAILURE, NOT A REVIEW COMMENT.
 *
 * §3.10: "There is no interceptor and no middleware. A write function added next
 * week is ungated unless somebody remembers, and the failure is SILENT — the
 * feature simply works for a lapsed user."
 *
 * ## Why this compares a manifest rather than guessing what a write is
 *
 * The obvious version tries to detect writes by name (`upsert*`, `add*`, `push*`)
 * and fails an ungated one. That is a heuristic, and a heuristic that is wrong in
 * the permissive direction fails silently — which is the exact property this is
 * supposed to remove.
 *
 * So it compares the CURRENT classification against a committed snapshot. Any
 * drift fails: a new export, a gated function that stopped being gated, an ungated
 * one that started. **A new write is a new export, so it cannot slip through**, and
 * deciding it is deliberately ungated means saying so in the manifest, in a commit,
 * where a reviewer sees it.
 *
 * That also catches the reverse, which has happened here: `refuseWrite()` replaced
 * `canWriteData()` at sixteen call sites and this script did not know the pattern,
 * so all sixteen silently reported as NOT GATED.
 *
 *   node scripts/gate-audit.mjs            print the three buckets
 *   node scripts/gate-audit.mjs --check    fail (exit 1) on any drift
 *   node scripts/gate-audit.mjs --write    accept the current state as expected
 */
const MANIFEST = "scripts/gate-manifest.json";
const flatten = (o) =>
  Object.entries(o)
    .flatMap(([f, fns]) => fns.map((fn) => `${f}#${fn}`))
    .sort();

const current = {
  gated: flatten(gated),
  conditional: flatten(partly),
  ungated: flatten(open_),
};

/**
 * ⚠️ A BULK REGENERATION IS A TOOL PROBLEM, NOT A CODE PROBLEM.
 *
 * `--check` catches a blind audit on a LATER commit: it reports 0 gated against a
 * manifest saying 32 and fails as drift. What it cannot catch on its own is a
 * pattern change and a regeneration in the SAME commit — that records 0 as the new
 * truth and blesses it, and the instrument's failure becomes the baseline every
 * later measurement is taken against.
 *
 * That is exactly what nearly happened when `refuseWrite()` replaced
 * `canWriteData()`: the audit did not know the pattern and reported all sixteen as
 * ungated. Regenerating at that moment would have written the blindness down.
 *
 * So a regeneration that moves more than {@link BULK} entries REFUSES, and says
 * why. Nobody legitimately re-classifies thirty functions in one commit; a number
 * that large means the PARSER changed, not the code.
 */
const BULK = 2;

if (process.argv.includes("--write")) {
  let moved = 0;
  let previous = null;
  try {
    previous = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    // No manifest yet — the first write is the baseline and cannot be a regression.
  }
  if (previous) {
    for (const bucket of ["gated", "conditional", "ungated"]) {
      const was = new Set(previous[bucket] ?? []);
      const now = new Set(current[bucket]);
      for (const fn of now) if (!was.has(fn)) moved += 1;
      for (const fn of was) if (!now.has(fn)) moved += 1;
    }
  }

  if (moved > BULK && !process.argv.includes("--force")) {
    console.error(`
⚠️ REFUSING TO REGENERATE. ${moved} entries would move, and the limit is ${BULK}.

A change that re-classifies this many functions at once is almost always the PARSER
having changed, not the code. Recording it would write the tool's blindness down as
the new truth, and every measurement after it would be taken against a broken
baseline.

This has already nearly happened once: \`refuseWrite()\` replaced \`canWriteData()\`
at sixteen call sites and this script did not know the pattern, so all sixteen
reported as NOT GATED.

  1. Run \`node scripts/gate-audit.mjs\` and READ the three buckets.
  2. Satisfy yourself the classification is TRUE of the code, not of a regex.
  3. Then re-run with --force.
`);
    process.exit(1);
  }

  writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`wrote ${MANIFEST}: ${current.gated.length} gated, ${current.conditional.length} conditional, ${current.ungated.length} ungated${moved ? ` (${moved} moved)` : ""}`);
} else if (process.argv.includes("--check")) {
  let expected;
  try {
    expected = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    console.error(`gate-audit: ${MANIFEST} is missing. Run: node scripts/gate-audit.mjs --write`);
    process.exit(1);
  }

  const problems = [];
  for (const bucket of ["gated", "conditional", "ungated"]) {
    const was = new Set(expected[bucket] ?? []);
    const now = new Set(current[bucket]);
    for (const fn of now) if (!was.has(fn)) problems.push([bucket, fn, "appeared in"]);
    for (const fn of was) if (!now.has(fn)) problems.push([bucket, fn, "disappeared from"]);
  }

  if (problems.length === 0) {
    console.log(`gate-audit: clean. ${current.gated.length} gated, ${current.conditional.length} conditional, ${current.ungated.length} ungated.`);
  } else {
    console.error("\n⚠️ GATE AUDIT FAILED. The read-only gate's coverage changed.\n");
    for (const [bucket, fn, how] of problems) {
      console.error(`  ${fn}\n      ${how} ${bucket.toUpperCase()}`);
    }
    console.error(`
A NEW EXPORT of a "use server" module lands in UNGATED unless it guards itself.
If it WRITES user data it must call refuseWrite() or requireWriteAccess(); a lapsed
account would otherwise keep using the feature and nothing would report it.

If it is deliberately ungated — a delete, a read, a setting, feedback, cancel or
resume — accept it deliberately and in a commit somebody reviews:

    node scripts/gate-audit.mjs --write

See lib/billing/gate.ts for what is never gated, and why each.
`);
    process.exit(1);
  }
} else {
  show("GATED", gated);
  console.log();
  show("CONDITIONALLY GATED — read the guard, it does not refuse every call", partly);
  console.log();
  show("NOT GATED", open_);
}
