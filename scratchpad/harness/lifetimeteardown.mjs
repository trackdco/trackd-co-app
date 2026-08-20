/**
 * TEAR THE LIFETIME RUN DOWN, BY ID, FROM THE DISK LEDGER.
 *
 *   node scratchpad/harness/lifetimeteardown.mjs          # delete what the ledger holds
 *   node scratchpad/harness/lifetimeteardown.mjs --list   # show it and delete nothing
 *
 * ⚠️ THIS READS ONLY THE LEDGER FILE. There is no query in here that SELECTS
 * accounts to delete, because a query is how a domain sweep destroyed 16 real
 * fixtures. Every id deleted was written to the ledger the moment it was created.
 *
 * ⚠️ IT EXISTS BECAUSE THE PROCESS CAN DIE. A lifetime run is long — clock hops, a
 * browser, a dev-server restart — and every safety property of an in-process
 * `finally` is downstream of the process surviving. Stripe KEEPS subscriptions and
 * invoices after a customer is deleted, so an orphaned test clock is permanent
 * test-mode residue, and the clock is therefore deleted EXPLICITLY rather than
 * left to fall out of deleting the customer.
 *
 * ⚠️ STRIPE FIRST, THEN THE ACCOUNT. `billing_customers` cascades away with the
 * profile and is the only mapping from a Stripe customer back to a user; the other
 * order leaves a live subscription billing somebody nothing can attribute.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const STATE_DIR =
  process.env.LIFETIME_STATE_DIR ??
  "/private/tmp/claude-501/-Users-adrianschimizzi-Documents-GitHub-trackd-co-app/c8a25fb1-b430-403c-8b43-871524985417/scratchpad";
const LEDGER_FILE = `${STATE_DIR}/lifetime-ledger.json`;

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  throw new Error("refusing to run: STRIPE_SECRET_KEY is not a test-mode key");
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let ledger;
try {
  ledger = JSON.parse(readFileSync(LEDGER_FILE, "utf8"));
} catch {
  console.log("no ledger file — nothing was recorded, so there is nothing to delete by id");
  process.exit(0);
}

console.log(`ledger holds: users=${ledger.users.length} customers=${ledger.customers.length} clocks=${ledger.clocks.length}`);
for (const id of ledger.users) console.log(`  user     ${id}`);
for (const id of ledger.customers) console.log(`  customer ${id}`);
for (const id of ledger.clocks) console.log(`  clock    ${id}`);

if (process.argv.includes("--list")) process.exit(0);

const failures = [];
const gone = { users: new Set(), customers: new Set(), clocks: new Set() };
const missing = (e) =>
  e?.code === "resource_missing" || /No such |resource_missing/i.test(e?.message ?? "");

for (const customerId of [...ledger.customers].reverse()) {
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const s of subs.data) {
      if (["canceled", "incomplete_expired"].includes(s.status)) continue;
      await stripe.subscriptions.cancel(s.id);
      console.log(`  cancelled ${s.id}`);
    }
    await stripe.customers.del(customerId);
    console.log(`  deleted customer ${customerId}`);
    gone.customers.add(customerId);
  } catch (e) {
    if (missing(e)) {
      console.log(`  customer ${customerId}: already absent`);
      gone.customers.add(customerId);
    } else failures.push(`stripe customer ${customerId}: ${e.message}`);
  }
}

for (const clockId of [...ledger.clocks].reverse()) {
  try {
    await stripe.testHelpers.testClocks.del(clockId);
    console.log(`  deleted test clock ${clockId}`);
    gone.clocks.add(clockId);
  } catch (e) {
    if (missing(e)) {
      console.log(`  clock ${clockId}: already absent`);
      gone.clocks.add(clockId);
    } else failures.push(`test clock ${clockId}: ${e.message}`);
  }
}

for (const id of [...ledger.users].reverse()) {
  if (!id) throw new Error("ledger holds an empty id; refusing to call deleteUser");
  try {
    const { error } = await admin.auth.admin.deleteUser(id);
    // ⚠️ The Supabase client RETURNS the error rather than throwing it, so
    // destructuring and ignoring it is how this silently does nothing.
    if (error) throw new Error(error.message);
    console.log(`  deleted auth user ${id}`);
    gone.users.add(id);
  } catch (e) {
    failures.push(`auth user ${id}: ${e.message}`);
  }
}

// ⚠️ ONLY WHAT WAS ACTUALLY DELETED LEAVES THE LEDGER. Anything that failed stays
// in it, so it can still be named BY ID by the next process.
const remaining = {
  users: ledger.users.filter((id) => !gone.users.has(id)),
  customers: ledger.customers.filter((id) => !gone.customers.has(id)),
  clocks: ledger.clocks.filter((id) => !gone.clocks.has(id)),
};
writeFileSync(LEDGER_FILE, JSON.stringify(remaining, null, 2));

if (failures.length) {
  console.error(`\nTEARDOWN FAILED — ${failures.length} object(s) NOT deleted and STILL IN THE LEDGER:`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log("\nteardown complete; ledger is empty");
