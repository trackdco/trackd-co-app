/**
 * PRODUCTION CLEANUP AUDIT.
 *
 * ⚠️ THIS SCRIPT DELETES NOTHING. It counts, names and stops.
 *
 * The database is production with ~90 real users. After a QA run it must return
 * to exactly that: no `@trackd-qa.invalid` accounts, no test clocks, no orphan
 * billing rows, and no Stripe customers left holding a live subscription.
 *
 * If it finds leftovers it prints their IDS, so a cleanup is done BY ID and
 * never by matching the domain — a previous domain sweep destroyed 16 real
 * fixtures.
 */

import { admin } from "./admin.mjs";
import { stripe } from "./qa-billing.mjs";

const QA = "@trackd-qa.invalid";

/* ── auth users ──────────────────────────────────────────────────── */
let page = 1;
const users = [];
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(error.message);
  users.push(...data.users);
  if (data.users.length < 1000) break;
  page += 1;
}
const qaUsers = users.filter((u) => (u.email ?? "").endsWith(QA));

console.log(`auth users:            ${users.length}`);
console.log(`  of which ${QA}: ${qaUsers.length}`);
for (const u of qaUsers) console.log(`    LEFTOVER  ${u.id}  ${u.email}`);

/* ── billing rows with no owner, and rows belonging to QA accounts ── */
const qaIds = new Set(qaUsers.map((u) => u.id));
const realIds = new Set(users.map((u) => u.id));

for (const table of ["billing_customers", "subscriptions", "entitlements"]) {
  const { data, error } = await admin.from(table).select("user_id");
  if (error) {
    console.log(`${table}: read failed — ${error.message}`);
    continue;
  }
  const rows = data ?? [];
  const onQa = rows.filter((r) => qaIds.has(r.user_id));
  const orphan = rows.filter((r) => !realIds.has(r.user_id));
  console.log(`${table}: ${rows.length} rows, ${onQa.length} on QA accounts, ${orphan.length} orphaned`);
  for (const r of [...onQa, ...orphan]) console.log(`    LEFTOVER  user_id=${r.user_id}`);
}

/* ── Stripe test clocks ──────────────────────────────────────────── */
const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
console.log(`stripe test clocks:    ${clocks.data.length}`);
for (const c of clocks.data) console.log(`    LEFTOVER  ${c.id}  ${c.name ?? ""} (${c.status})`);

/* ── Stripe customers created by this QA work ────────────────────── */
const custs = await stripe.customers.list({ limit: 100 });
const qaCusts = custs.data.filter(
  (c) => (c.email ?? "").endsWith(QA) || c.metadata?.purpose?.startsWith("spec03"),
);
console.log(`stripe customers (last 100): ${custs.data.length}, of which QA-tagged: ${qaCusts.length}`);
for (const c of qaCusts) {
  const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
  const live = subs.data.filter((s) => !["canceled", "incomplete_expired"].includes(s.status));
  console.log(`    LEFTOVER  ${c.id}  ${c.email ?? ""}  live subs: ${live.length}`);
}

const clean =
  qaUsers.length === 0 && clocks.data.length === 0 && qaCusts.length === 0;
console.log(`\n${clean ? "CLEAN" : "⚠️ LEFTOVERS ABOVE — delete BY ID, Stripe objects first"}`);
console.log(`expected: 90 auth users, 0 QA accounts, 0 test clocks, 0 QA Stripe customers`);
