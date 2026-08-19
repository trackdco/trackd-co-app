/**
 * PRODUCTION CLEANUP AUDIT.
 *
 * ⚠️ THIS SCRIPT DELETES NOTHING. It counts, names and stops.
 *
 * The database is production with ~90 real users. After a QA run it must return
 * to exactly that: no `@trackd-qa.invalid` accounts, no test clocks, no orphan
 * billing rows, and no Stripe customer left holding a live subscription.
 *
 * If it finds leftovers it prints their IDS, so a cleanup is done BY ID and
 * never by matching the domain — a previous domain sweep destroyed 16 real
 * fixtures.
 *
 * ## ⚠️ THE EXIT CODE CARRIES THE ANSWER (modelled on `scripts/reconcile.mjs`)
 *
 *   0  clean       — everything was measured, and every number was zero
 *   1  dirty       — leftovers named above
 *   2  incomplete  — IT COULD NOT SEE EVERYTHING, SO IT PROVED NOTHING
 *
 * Two is not a softer one. A read that failed is not a read that returned zero,
 * and this script's whole job is to be believed when it says clean.
 *
 * ## ⚠️ WHAT THIS FILE GOT WRONG UNTIL 18 AUG 2026
 *
 * It measured six things, printed all six, and computed CLEAN from three. The
 * orphan counts, the live-subscription counts and the "expected 90" line were
 * printed as prose and excluded from the verdict. All of them are in it now.
 *
 * ## ⚠️ AND ONE PREMISE BEHIND THAT BRIEF IS FALSE, MEASURED
 *
 * Orphans were described as "the state that survives a cleanup, because the auth
 * user is already gone". **In this schema they cannot exist.** All three tables
 * carry `ON DELETE CASCADE` to `auth.users`:
 *
 *     billing_customers_user_id_fkey   CASCADE
 *     entitlements_user_id_fkey        CASCADE
 *     subscriptions_user_id_fkey       CASCADE
 *
 * Driven both ways on 18 Aug 2026: inserting a row for a non-existent user is
 * REFUSED by the foreign key, and deleting the owning auth user by id removes the
 * entitlement with it (1 row before, 0 after, no error). So an orphan is not a
 * leak this database can produce.
 *
 * The check stays in the verdict anyway, and cheaply: it costs one comparison, it
 * is defence against a future schema change, and a number that is always zero is
 * the right kind of number to assert. **But it has no live control** — the state
 * cannot be created to prove the detector would catch it — and that is recorded
 * here rather than left as an unearned claim.
 *
 * Three more, each now closed:
 *
 *   - **`(c.email ?? "")` was standing rule 0 inside the leak detector itself.**
 *     A Stripe customer with NO EMAIL was treated as definitely-not-QA rather
 *     than as unknown, and at least ten driver call sites create customers with
 *     no email at all. Nothing is classified away now: EVERY customer is listed,
 *     and every customer's subscriptions are read, so an unlabelled QA object
 *     that is still billing is caught by what it is DOING rather than by how it
 *     happens to be tagged.
 *   - **`testClocks.list` and `customers.list` were unpaginated at limit 100**
 *     and fed the verdict directly, while the auth read immediately above them
 *     paged properly. Both auto-page now, with a cap that reports INCOMPLETE
 *     rather than silently truncating.
 *   - **A failed table read `continue`d** and left the verdict to the other
 *     tables. It is now incomplete.
 *
 * ## ⚠️ THE USER COUNT IS A FINDING, NEVER AN INSTRUCTION
 *
 * If the auth-user count is not the expected baseline, this reports it and stops.
 * **A real signup is a legitimate reason for the number to RISE**, and the
 * correct response to that is to raise `QA_AUDIT_EXPECT_USERS`, never to delete
 * anybody. Nothing in this file may ever be used to reconcile production to a
 * number.
 */

import { admin } from "./admin.mjs";
import { stripe } from "./qa-billing.mjs";

const QA = "@trackd-qa.invalid";
/**
 * ⚠️ 92 SINCE 20 AUG 2026. EVERY INCREMENT HAS BEEN A REAL PERSON.
 *
 * 90 at the freeze; 91 after a Google sign-up at 05:30Z on 18 Aug; 92 after
 * another on 19 Aug. Both `google` provider on real addresses, which nothing in
 * the QA tooling can create — `makeUser` issues email+password accounts on
 * `@trackd-qa.invalid` and nothing else, and that count has been 0 throughout.
 *
 * ⚠️ `entitlements` IS STILL 90, so neither new account holds a row. That is the
 * post-backfill sign-up cohort, and it is exactly the path driven in Group 3: at
 * P13 they meet the read-only pop-up, reach the price list, and are offered a
 * genuine 7-day trial. The backfill must NOT be re-run to cover them.
 *
 * The number was RAISED each time, which is what this file's own rule says to do.
 * Nobody was deleted, and no identity is recorded here — these are real users of
 * a production app and this file is tracked.
 */
const EXPECT_USERS = Number(process.env.QA_AUDIT_EXPECT_USERS ?? 92);

/**
 * ⚠️ SUBSCRIPTIONS A PERSON HAS ALREADY LOOKED AT, BY ID, WITH THE DATE THEY
 * LOOKED. This is an inspection record, not a filter.
 *
 * Reading every customer's subscriptions surfaced twelve live ones on the first
 * run — a number the old verdict could not produce, because it only read
 * subscriptions for customers it had already classified as QA, and it had
 * classified none. Inspected 18 Aug 2026, every one of them:
 *
 *   · all `livemode: false` on an `sk_test_` key, so none can charge anybody;
 *   · all created 25 Jun to 7 Aug 2026, before this batch's QA runs began;
 *   · none on `@trackd-qa.invalid`, none carrying a test clock;
 *   · five are Stripe's own sample data, `metadata.sample === "true"`;
 *   · the two `past_due` no-email pair are the 7 Aug dunning fixtures;
 *   · and `billing_customers` and `subscriptions` are both EMPTY, so not one of
 *     them maps to a user in this database.
 *
 * They are listed BY SUBSCRIPTION ID rather than by customer, so a NEW
 * subscription on one of these same customers is still a finding. Nothing is
 * matched by pattern, by email or by age — those are the classifications that
 * let the original leak through.
 *
 * ⚠️ This list is not a licence to delete them. It records that they were seen.
 */
const INSPECTED_18_AUG_2026 = new Set([
  "sub_1U1qQhEmCWV24GLCcspfU3D1", // no-email past_due dunning fixture, 7 Aug
  "sub_1U1psxEmCWV24GLCJnu5CoCt", // no-email past_due dunning fixture, 7 Aug
  "sub_1TowhrEmCWV24GLCFJuAkWMQ", // example@mail.com, 3 Jul
  "sub_1Towh9EmCWV24GLCsZ1Aayxz", // example@mail.com, 3 Jul
  "sub_1Tovm8EmCWV24GLCG19OVvCh", // example@mail.com, 3 Jul
  "sub_1TovkgEmCWV24GLCzwr7BdeC", // example@mail.com, 3 Jul
  "sub_1Tovj4EmCWV24GLCw16YnQ2i", // example@mail.com, 3 Jul
  "sub_1TodDvEmCWV24GLCtTeT6n1q", // sample:"true", 2 Jul
  "sub_1TmbPwEmCWV24GLCUi37cGDx", // sample:"true", 26 Jun
  "sub_1TmYOeEmCWV24GLCG2ksj7SG", // sample:"true", 26 Jun
  "sub_1Tm77dEmCWV24GLCW3uXFMAv", // sample:"true", 25 Jun
  "sub_1Tm72NEmCWV24GLChXwUB6ss", // sample:"true", 25 Jun
]);
/** Above any real population here; hitting it means the listing was truncated. */
const STRIPE_CAP = 5000;

/** Findings make it dirty; blind spots make it incomplete. Both are named. */
const findings = [];
const blind = [];
const note = (n) => findings.push(n);
const cannotSee = (n) => blind.push(n);

/* ── auth users ──────────────────────────────────────────────────── */
let users = [];
try {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }
} catch (e) {
  cannotSee(`auth users: read failed — ${e.message}`);
  users = null;
}

const qaUsers = users ? users.filter((u) => (u.email ?? "").endsWith(QA)) : [];
if (users) {
  console.log(`auth users:            ${users.length}`);
  console.log(`  of which ${QA}: ${qaUsers.length}`);
  for (const u of qaUsers) console.log(`    LEFTOVER  ${u.id}  ${u.email}`);
  if (qaUsers.length > 0) note(`${qaUsers.length} ${QA} account(s) still present`);
  if (users.length !== EXPECT_USERS) {
    note(
      `auth users is ${users.length}, expected ${EXPECT_USERS} — a real signup raises this ` +
        `legitimately; raise QA_AUDIT_EXPECT_USERS, never delete anybody to match it`,
    );
  }
}

/* ── billing rows with no owner, and rows belonging to QA accounts ── */
const qaIds = new Set(qaUsers.map((u) => u.id));
const realIds = users ? new Set(users.map((u) => u.id)) : null;

for (const table of ["billing_customers", "subscriptions", "entitlements"]) {
  /** Paged explicitly: PostgREST caps a bare select and would not say so. */
  const rows = [];
  let truncated = false;
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(table).select("user_id").range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
      if (rows.length >= 100000) { truncated = true; break; }
    }
  } catch (e) {
    cannotSee(`${table}: read failed — ${e.message}`);
    console.log(`${table}: READ FAILED — ${e.message}`);
    continue;
  }
  if (truncated) cannotSee(`${table}: listing truncated, the count above is a floor`);

  const onQa = rows.filter((r) => qaIds.has(r.user_id));
  /**
   * ⚠️ ORPHANS NEED THE AUTH LIST TO BE ASKED AT ALL. Without it every row would
   * look orphaned, so this reports that it could not ask rather than reporting a
   * number it cannot stand behind.
   */
  const orphan = realIds ? rows.filter((r) => !realIds.has(r.user_id)) : null;
  console.log(
    `${table}: ${rows.length} rows, ${onQa.length} on QA accounts, ` +
      `${orphan ? orphan.length : "?"} orphaned`,
  );
  for (const r of [...onQa, ...(orphan ?? [])]) console.log(`    LEFTOVER  user_id=${r.user_id}`);
  if (onQa.length > 0) note(`${table}: ${onQa.length} row(s) on QA accounts`);
  if (orphan === null) cannotSee(`${table}: orphans not computable, the auth list is missing`);
  else if (orphan.length > 0) {
    note(`${table}: ${orphan.length} ORPHANED row(s) — these survive a teardown, the user is gone`);
  }
}

/* ── Stripe test clocks — auto-paged ─────────────────────────────── */
let clocks = null;
try {
  clocks = [];
  for await (const c of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    clocks.push(c);
    if (clocks.length >= STRIPE_CAP) { cannotSee("test clocks: hit the listing cap"); break; }
  }
} catch (e) {
  cannotSee(`test clocks: read failed — ${e.message}`);
  clocks = null;
}
if (clocks) {
  console.log(`stripe test clocks:    ${clocks.length}`);
  for (const c of clocks) console.log(`    LEFTOVER  ${c.id}  ${c.name ?? ""} (${c.status})`);
  if (clocks.length > 0) note(`${clocks.length} Stripe test clock(s) left standing`);
}

/* ── Stripe customers — ALL of them, auto-paged, none classified away ── */
let custs = null;
try {
  custs = [];
  for await (const c of stripe.customers.list({ limit: 100 })) {
    custs.push(c);
    if (custs.length >= STRIPE_CAP) { cannotSee("customers: hit the listing cap"); break; }
  }
} catch (e) {
  cannotSee(`stripe customers: read failed — ${e.message}`);
  custs = null;
}

if (custs) {
  /**
   * Three buckets and no fourth. `unknown` is the bucket the old `?? ""` did not
   * have: a customer with no email is not evidence of anything, and saying so is
   * the whole point.
   */
  const classify = (c) => {
    if (typeof c.email === "string" && c.email.endsWith(QA)) return "qa";
    if (c.metadata?.purpose?.startsWith("spec03")) return "qa";
    if (!c.email) return "unknown";
    return "other";
  };
  const qaCusts = custs.filter((c) => classify(c) === "qa");
  const unknown = custs.filter((c) => classify(c) === "unknown");
  console.log(
    `stripe customers: ${custs.length} total, ${qaCusts.length} QA-tagged, ` +
      `${unknown.length} UNCLASSIFIABLE (no email)`,
  );
  if (qaCusts.length > 0) note(`${qaCusts.length} QA-tagged Stripe customer(s)`);

  /**
   * ⚠️ EVERY customer's subscriptions are read, not just the QA-tagged ones.
   * A live subscription on a QA object is the leak that costs money, and it is
   * caught by what the object is DOING rather than by how it is labelled — which
   * is what makes the unclassifiable bucket safe to merely report.
   */
  let liveTotal = 0;
  let freshTotal = 0;
  for (const c of custs) {
    const kind = classify(c);
    let live = null;
    try {
      const subs = [];
      for await (const s of stripe.subscriptions.list({ customer: c.id, status: "all", limit: 100 })) {
        subs.push(s);
        if (subs.length >= STRIPE_CAP) { cannotSee(`subscriptions for ${c.id}: hit the listing cap`); break; }
      }
      live = subs.filter((s) => !["canceled", "incomplete_expired"].includes(s.status));
    } catch (e) {
      cannotSee(`subscriptions for ${c.id}: read failed — ${e.message}`);
      continue;
    }
    const fresh = live.filter((s) => !INSPECTED_18_AUG_2026.has(s.id));
    liveTotal += live.length;
    freshTotal += fresh.length;
    if (kind !== "other" || live.length > 0) {
      const tag = kind === "qa" ? "LEFTOVER " : kind === "unknown" ? "UNKNOWN  " : "         ";
      const seen = live.length - fresh.length;
      console.log(
        `    ${tag} ${c.id}  ${c.email ?? "(no email)"}  live subs: ${live.length}` +
          (seen > 0 ? ` (${seen} inspected 18 Aug)` : ""),
      );
      for (const s of fresh) console.log(`        LIVE, NOT INSPECTED  ${s.id}  ${s.status}`);
    }
  }
  console.log(
    `stripe live subscriptions across ALL customers: ${liveTotal} ` +
      `(${liveTotal - freshTotal} inspected 18 Aug 2026, ${freshTotal} not)`,
  );
  if (freshTotal > 0) {
    note(`${freshTotal} live Stripe subscription(s) nobody has looked at — a QA object still billing is the costly leak`);
  }
}

/* ── the verdict, from EVERY number above ────────────────────────── */
console.log("");
if (blind.length > 0) {
  console.log("⚠️ INCOMPLETE — could not see everything, so nothing is proved:");
  for (const b of blind) console.log(`   · ${b}`);
}
if (findings.length > 0) {
  console.log("⚠️ LEFTOVERS — delete BY ID, Stripe objects first:");
  for (const f of findings) console.log(`   · ${f}`);
}
if (blind.length === 0 && findings.length === 0) {
  console.log(
    `CLEAN — ${EXPECT_USERS} auth users, 0 QA accounts, 0 orphans, 0 test clocks, ` +
      `0 QA Stripe customers, and no live Stripe subscription that has not been ` +
      `inspected by id. Every number printed above is in this verdict.`,
  );
}
process.exit(blind.length > 0 ? 2 : findings.length > 0 ? 1 : 0);
