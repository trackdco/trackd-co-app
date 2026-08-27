/**
 * SHARED HELPERS FOR THE FINAL-ROUND DRIVERS (Groups A, B, G).
 *
 * ⚠️ EVERY ID IS RECORDED TO A FILE BEFORE IT IS USED. A Stripe object that
 * exists and has not reached disk is an object nothing can find after a crash,
 * and the crashed run is exactly the case the out-of-process count exists for.
 *
 * ⚠️ TEARDOWN IS STRIPE FIRST, THEN THE ACCOUNT, and it deletes BY ID from this
 * ledger only. There is no query anywhere here that SELECTS accounts to delete —
 * a domain sweep destroyed sixteen real fixtures once.
 */
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { admin, env } from "../admin.mjs";

export { admin, env };
export const stripe = new Stripe(env.STRIPE_SECRET_KEY);
export const BASE = process.env.BASE ?? "http://localhost:3100";
export const DAY = 86_400_000;

const STATE_DIR =
  process.env.FINAL_STATE_DIR ??
  "/private/tmp/claude-501/-Users-adrianschimizzi-Documents-GitHub-trackd-co-app/0a7847f7-d236-4c11-9d26-bf86f7311d86/scratchpad";
const LEDGER = path.join(STATE_DIR, "final-ledger.json");

function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); }
  catch { return { users: [], customers: [], clocks: [] }; }
}
function writeLedger(v) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  const fd = fs.openSync(LEDGER, "w");
  try { fs.writeFileSync(fd, JSON.stringify(v, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
/** Record BEFORE the id can be lost. Idempotent. */
export function record(kind, id) {
  if (!id) throw new Error(`record: refusing to record an empty ${kind}`);
  const l = readLedger();
  if (!l[kind].includes(id)) l[kind].push(id);
  writeLedger(l);
  return id;
}
export function ledger() { return readLedger(); }

/** Stripe first, then the account. Survivors STAY in the ledger and it throws. */
export async function teardown() {
  const l = readLedger();
  const failures = [];
  const gone = { users: [], customers: [], clocks: [] };
  const missing = (e) =>
    e?.code === "resource_missing" || /No such |resource_missing/i.test(e?.message ?? "");

  for (const id of [...l.customers].reverse()) {
    try {
      const subs = await stripe.subscriptions.list({ customer: id, status: "all", limit: 100 });
      for (const s of subs.data) {
        if (["canceled", "incomplete_expired"].includes(s.status)) continue;
        await stripe.subscriptions.cancel(s.id);
      }
      await stripe.customers.del(id);
      gone.customers.push(id);
    } catch (e) {
      if (missing(e)) gone.customers.push(id);
      else failures.push(`stripe customer ${id}: ${e.message}`);
    }
  }
  for (const id of [...l.clocks].reverse()) {
    try { await stripe.testHelpers.testClocks.del(id); gone.clocks.push(id); }
    catch (e) { if (missing(e)) gone.clocks.push(id); else failures.push(`clock ${id}: ${e.message}`); }
  }
  for (const id of [...l.users].reverse()) {
    if (!id) throw new Error("ledger holds an empty id; refusing to call deleteUser");
    try {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
      gone.users.push(id);
    } catch (e) { failures.push(`auth user ${id}: ${e.message}`); }
  }
  const left = {
    users: l.users.filter((x) => !gone.users.includes(x)),
    customers: l.customers.filter((x) => !gone.customers.includes(x)),
    clocks: l.clocks.filter((x) => !gone.clocks.includes(x)),
  };
  writeLedger(left);
  if (failures.length) {
    throw new Error(
      `TEARDOWN FAILED — delete BY ID, Stripe first:\n` + failures.map((f) => `  · ${f}`).join("\n") +
      `\n  still held: ${JSON.stringify(left)}`,
    );
  }
  console.log(`  teardown: ${gone.users.length} user(s), ${gone.customers.length} customer(s), ${gone.clocks.length} clock(s)`);
}

/* ─────────────────── the app's own webhook ─────────────────── */

const SECRET = env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

/**
 * ⚠️ THE ONLY WAY INTO THE APP. Stripe cannot reach localhost and the app grants
 * access in the webhook and nowhere else, so every entitlement asserted here is
 * written by the app's own handler from a real Stripe object.
 *
 * `id` defaults to a fresh one. Passing the REAL event id exercises
 * `webhook_events` idempotency exactly as production does; passing a fresh id on
 * the same payload is what tests the HANDLER's own idempotence, which the route's
 * dedupe would otherwise hide.
 */
export async function deliver(event, { id } = {}) {
  /**
   * ⚠️ OMITTING `id` MINTS A FRESH ONE, AND IT USED TO FALL BACK TO `event.id`.
   *
   * That fallback made every "deliver the same payload again" assertion VACUOUS:
   * the route's `webhook_events` primary key short-circuited on the real id and
   * answered `{"received":true,"duplicate":true}` — a 200 — so the handler never
   * ran and the driver reported "the date is identical" about a request that had
   * done nothing at all. Found on the Group G drive, where the entitlement did not
   * move and the code says it should have.
   *
   * Callers that WANT the route's dedupe exercised pass `{ id: event.id }`
   * explicitly, which every drain here does.
   */
  const payload = JSON.stringify({
    id: id ?? `evt_final_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: Math.floor(Date.now() / 1000),
    type: event.type,
    data: event.data,
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

/**
 * Real events for this customer since `sinceMs`, oldest first.
 *
 * ⚠️ `sinceMs` IS A WALL-CLOCK MOMENT AND MUST NOT BE THE SIMULATED ONE.
 *
 * `event.created` does NOT follow a test clock — the harness README says so about
 * measuring lead times, and it bites here for a different reason: a clock frozen
 * 40 days in the past made `created: { gte: t0 }` ask for forty days of the whole
 * ACCOUNT'S event stream. Every page came back full, the early `break` never
 * fired because nothing was older than the window, and one call took **3m39s**.
 * Pass the instant the RUN started.
 *
 * Capped as well, because a cap that is never reached costs nothing and a sweep
 * that pages an account's whole history is a driver that looks hung.
 */
export async function eventsFor(customerId, sinceMs, { maxScanned = 400 } = {}) {
  const out = [];
  let scanned = 0;
  for await (const e of stripe.events.list({
    created: { gte: Math.floor(sinceMs / 1000) - 60 }, limit: 100,
  })) {
    scanned += 1;
    const o = e.data.object ?? {};
    const belongs =
      o.customer === customerId || o.id === customerId ||
      (typeof o.customer === "object" && o.customer?.id === customerId);
    if (belongs) out.push(e);
    if (e.created < Math.floor(sinceMs / 1000) - 300) break;
    if (scanned >= maxScanned) {
      console.warn(`  ⚠️ eventsFor scanned ${scanned} events and stopped; the window may be short`);
      break;
    }
  }
  return out.reverse();
}

/* ─────────────────── reading the truth ─────────────────── */

/** ⚠️ THE ROW, never a handler's return value. Handlers here answered "handled"
 *  throughout the life of two separate defects. */
export async function entitlement(userId) {
  const { data, error } = await admin.from("entitlements")
    .select("source, product, active_until, is_active")
    .eq("user_id", userId).eq("product", "pro").eq("source", "stripe");
  if (error) throw new Error(`entitlement read: ${error.message}`);
  return data?.[0] ?? null;
}
export async function mirror(userId) {
  const { data, error } = await admin.from("subscriptions")
    .select("stripe_subscription_id, status, cancel_at_period_end, trial_ends_at, current_period_end, courtesy_until")
    .eq("user_id", userId);
  if (error) throw new Error(`mirror read: ${error.message}`);
  return data ?? [];
}

/* ─────────────────── test clock ─────────────────── */

export async function newClock(frozenAtMs) {
  const c = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(frozenAtMs / 1000),
  });
  return record("clocks", c.id);
}
/** Hops in <=7d steps: Stripe caps one advance at two billing intervals. */
export async function advanceTo(clockId, whenMs, { maxHopMs = 7 * DAY, timeoutMs = 240_000 } = {}) {
  const target = Math.floor(whenMs / 1000);
  for (;;) {
    const cur = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (cur.frozen_time >= target) return;
    const next = Math.min(target, cur.frozen_time + Math.floor(maxHopMs / 1000));
    await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: next });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const c = await stripe.testHelpers.testClocks.retrieve(clockId);
      if (c.status === "ready") break;
      if (c.status === "internal_failure") throw new Error(`clock ${clockId} failed`);
      if (Date.now() > deadline) throw new Error(`clock ${clockId} still ${c.status}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/* ─────────────────── assertions ─────────────────── */

export class Checks {
  all = [];
  leg = "?";
  at(leg) { this.leg = leg; console.log(`\n──────── ${leg} ────────`); }
  /** ARRIVAL: assert you REACHED the state before asserting anything about it. */
  arrived(name, pass, detail = "") { return this.check(`ARRIVAL: ${name}`, pass, detail); }
  check(name, pass, detail = "") {
    this.all.push({ leg: this.leg, name, pass, detail });
    console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
    return pass;
  }
  summary() {
    const passed = this.all.filter((c) => c.pass).length;
    return { passed, failed: this.all.length - passed };
  }
  report() {
    const { passed, failed } = this.summary();
    console.log(`\n════════ ${passed} passed, ${failed} failed ════════`);
    for (const c of this.all.filter((x) => !x.pass)) console.log(`  ❌ [${c.leg}] ${c.name} — ${c.detail}`);
    return failed;
  }
}

export const iso = (s) => new Date(s * 1000).toISOString();
export const days = (a, b) => (Date.parse(a) - Date.parse(b)) / DAY;
