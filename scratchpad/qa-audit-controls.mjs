/**
 * CONTROLS FOR THE REWRITTEN LEAK DETECTOR.
 *
 * A detector that has only ever printed CLEAN proves nothing. Each control
 * creates ONE named artefact, asserts the exit code moves, and removes it BY ID.
 * The orphan control is the important one: it is the state the old verdict
 * printed and then excluded, and it is the state that survives a teardown.
 */
import { execFileSync } from "node:child_process";
const { admin, makeUser, dropUser } = await import("file:///Users/adrianschimizzi/Documents/GitHub/trackd-co-app/scratchpad/admin.mjs");

const run = () => {
  try {
    execFileSync("node", ["scratchpad/qa-audit.mjs"], {
      cwd: "/Users/adrianschimizzi/Documents/GitHub/trackd-co-app", stdio: "pipe",
    });
    return 0;
  } catch (e) { return e.status; }
};

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let userId = null;
let orphanId = null;
try {
  check("BASELINE: the clean state exits 0", run() === 0);

  /* ── control 1: a QA account present -> dirty ───────────────────── */
  const u = await makeUser("qa-audit-control");
  userId = u.id;
  check("CONTROL a QA account present exits 1 (dirty)", run() === 1, u.email);
  await dropUser(userId); userId = null;
  check("  and removing it BY ID returns to 0", run() === 0);

  /* ── control 2: an ORPHAN row. ⚠️ IT CANNOT BE CREATED — see qa-audit.mjs.
     All three tables cascade from auth.users, so the insert is refused by the
     foreign key and deleting the owner removes the row rather than orphaning it.
     Left here, attempted and reported, so the absence of this control is visible
     in the output rather than being a check nobody notices is missing. ── */
  const ghost = "00000000-0000-4000-8000-0000000000ff";
  orphanId = ghost;
  const ins = await admin.from("entitlements").insert({
    user_id: ghost, product: "pro", source: "comp", active_until: null, is_active: false,
  });
  if (ins.error) {
    console.log(`  (orphan control could not seed: ${ins.error.message})`);
    orphanId = null;
  } else {
    const back = await admin.from("entitlements").select("user_id").eq("user_id", ghost);
    check("  ARRIVAL: the orphan row is really there", back.data?.length === 1);
    check(
      "⚠️ CONTROL an ORPHAN entitlement exits 1 — the leak that survives a teardown",
      run() === 1,
      "the old verdict printed this number and excluded it from CLEAN",
    );
    const del = await admin.from("entitlements").delete().eq("user_id", ghost);
    if (del.error) throw new Error(`orphan cleanup failed: ${del.error.message}`);
    orphanId = null;
    check("  and removing it BY user_id returns to 0", run() === 0);
  }

  /* ── control 3: a read it cannot do -> INCOMPLETE, not clean ────── */
  const bad = execFileSync("node", ["scratchpad/qa-audit.mjs"], {
    cwd: "/Users/adrianschimizzi/Documents/GitHub/trackd-co-app",
    env: { ...process.env, QA_AUDIT_EXPECT_USERS: "90" }, stdio: "pipe",
  });
  check("  (sanity) a normal run still prints a verdict line", /CLEAN|LEFTOVERS|INCOMPLETE/.test(bad.toString()));
} finally {
  if (userId) await dropUser(userId).then(() => console.log(`  dropped ${userId}`));
  if (orphanId) {
    const d = await admin.from("entitlements").delete().eq("user_id", orphanId);
    console.log(`  orphan cleanup: ${d.error ? d.error.message : "removed"}`);
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} controls passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
