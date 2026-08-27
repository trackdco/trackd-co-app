/**
 * Regenerate `lib/billing/gate.ts`'s coverage list FROM THE CODE.
 *
 * The hand-written version was wrong in both directions and a cold review found
 * it. Parses each exported async function's own body rather than grepping the
 * file, because the guard text is identical everywhere and a grep cannot tell
 * which function it belongs to — a mistake that has already been made once, and
 * silently un-gated `startBlock` inside the commit that fixed it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
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
    const isGated = /canWriteData\(\)|requireWriteAccess\(\)/.test(body);
    // A guard can be CONDITIONAL — `setProtocolCompoundActive` gates the re-add
    // and lets the delete through, because one function serves both directions.
    // Reported as its own bucket rather than as "gated": a reader who takes
    // "gated" to mean "always refuses" would be wrong about half the calls, and
    // this whole script exists because a list that is subtly wrong is worse than
    // no list. Detected on the guard's own line, which is where house style puts
    // the whole condition; a trailing comment is stripped first.
    const guardLine =
      body.split("\n").find((l) => /canWriteData\(\)|requireWriteAccess\(\)/.test(l)) ?? "";
    const conditional = /&&|\|\|/.test(guardLine.split("//")[0]);
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
show("GATED", gated);
console.log();
show("CONDITIONALLY GATED — read the guard, it does not refuse every call", partly);
console.log();
show("NOT GATED", open_);
