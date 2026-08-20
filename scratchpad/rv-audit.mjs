/**
 * COLDCHAT-REVERIFY ledger count. READ-ONLY. Run after EVERY drive, incl. failed.
 *
 * My accounts are `qa-rv-` on @trackd-qa.invalid. Nothing here deletes; it only
 * counts, and it names survivors BY ID so they can be deleted by id.
 */
import Stripe from "stripe";
import { admin, env } from "./admin.mjs";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const all = users?.users ?? [];
const qa = all.filter((u) => u.email?.endsWith("@trackd-qa.invalid"));
const mine = qa.filter((u) => u.email?.startsWith("qa-rv-"));

const ents = await admin.from("entitlements").select("user_id", { count: "exact", head: true });
const subs = await admin.from("subscriptions").select("user_id", { count: "exact", head: true });
const cust = await admin.from("billing_customers").select("user_id", { count: "exact", head: true });
if (ents.error || subs.error || cust.error) {
  throw new Error(`a count read FAILED, so this audit measured nothing: ${ents.error?.message ?? ""} ${subs.error?.message ?? ""} ${cust.error?.message ?? ""}`);
}

const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
const customers = await stripe.customers.list({ limit: 100 });
const mineCust = customers.data.filter((c) => c.email?.startsWith("qa-rv-"));
const allSubs = await stripe.subscriptions.list({ status: "all", limit: 100 });
const billable = allSubs.data.filter((s) => !["canceled", "incomplete_expired"].includes(s.status));

console.log(`auth=${all.length}  qa=${qa.length}  MINE(qa-rv-)=${mine.length}`);
console.log(`db: entitlements=${ents.count} subscriptions=${subs.count} billing_customers=${cust.count}`);
console.log(`stripe: clocks=${clocks.data.length} customers(p1)=${customers.data.length} mine-customers=${mineCust.length} non-terminal-subs=${billable.length}`);
if (mine.length) console.log(`  ⚠️ MINE LEFT (delete BY ID): ${mine.map((u) => `${u.id} ${u.email}`).join("\n     ")}`);
if (mineCust.length) console.log(`  ⚠️ MY STRIPE CUSTOMERS: ${mineCust.map((c) => `${c.id} ${c.email}`).join("\n     ")}`);
if (billable.length) console.log(`  ⚠️ non-terminal subs: ${billable.map((s) => `${s.id} ${s.status} cust=${s.customer}`).join("\n     ")}`);
if (clocks.data.length) console.log(`  ⚠️ clocks: ${clocks.data.map((c) => `${c.id}(${c.status})`).join(", ")}`);
