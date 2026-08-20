/**
 * THE FULL-LIFECYCLE CLOCK RUN — shared spine (§9b).
 *
 * Every test-clock run on this project so far has been a FRAGMENT: one leg, one
 * cohort, seeded fresh. This file exists so ONE account on ONE clock can be
 * carried from signup to refusal with state carried forward the whole way, which
 * is the only arrangement that can show an error that ACCUMULATES — a marker that
 * should have been cleared three legs ago, a date that was right when it was
 * written and wrong by the time it was read.
 *
 * ⚠️ NOTHING HERE SEEDS BILLING STATE. There is no `seedAccount` equivalent and
 * that is deliberate. If a leg needs a state the previous leg did not produce,
 * that is a FINDING, not a reason to seed it.
 *
 * ## ⚠️ THE ONE INSTRUMENT DECISION THAT SHAPES THE WHOLE RUN: t0 IS IN THE PAST
 *
 * The app reads `entitlements.active_until` and compares it against
 * `new Date()` — WALL CLOCK. A Stripe test clock moves STRIPE's clock and not the
 * server's. So a clock frozen at `now` puts every simulated date weeks into the
 * wall-clock FUTURE, and an account whose access has demonstrably lapsed in
 * simulated time still reads as fully entitled to the app. Legs 10 and 11 — the
 * lapse, the read-only pop-up, the refusal — are unobservable that way, and every
 * previous fragment simply did not reach them.
 *
 * So the clock is frozen ~38 days in the PAST, sized (see `plannedT0`) so that the
 * three-day grace written at leg 9 expires in REAL time a few minutes into the
 * dunning window. Both sides of the pre-lapse/after-lapse boundary are then
 * genuinely observable on one account, which is the whole point of leg 10.
 *
 * ⚠️ WHAT THAT COSTS, STATED RATHER THAN HIDDEN: legs 1 to 8 run at simulated
 * instants that are in the wall-clock past, so their dates read as historic. That
 * is sound for those legs and only those legs, because THE GATE IS OFF for them —
 * the gate-off world is precisely the one where entitlement expiry decides
 * nothing — and every assertion they make is against the mirror, the Stripe
 * object or the invoice, never against "is this date still in the future".
 * `isGenuineTrial` was read before choosing this: it branches on status,
 * `courtesyUntil` and `isBetaGrace`, and touches no clock at all.
 *
 * ## ⚠️ THE LEDGER IS ON DISK, NOT IN MEMORY, AND THAT IS A SAFETY PROPERTY
 *
 * `core.ts`'s `Ledger` is in-process, and every safety property of this run is
 * downstream of the process surviving. A lifetime run is long — clock hops,
 * browser drives, a dev-server restart — so the process dying halfway is a
 * REALISTIC case rather than a remote one, and an in-memory ledger takes the ids
 * with it. Stripe keeps subscriptions and invoices after a customer is deleted,
 * so an orphaned test clock is permanent test-mode residue.
 *
 * Ids are appended to a file OUTSIDE THE REPO the moment each object is created,
 * fsynced, and `lifetimeteardown.mjs` can delete them BY ID from that file at any
 * later moment, from any process. The deletion policy is unchanged and must stay
 * unchanged: BY ID, from the ledger, never by a domain match — a previous agent's
 * domain sweep destroyed 16 real fixtures.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type Stripe from "stripe";

import { admin, stripe } from "./core";

/**
 * ⚠️ OUTSIDE THE REPO. `harness/` is TRACKED (see `.gitignore`'s negation), and a
 * run's live Stripe ids are not something to commit. The session scratchpad is
 * also the one directory that survives the repo being reset.
 */
export const STATE_DIR =
  process.env.LIFETIME_STATE_DIR ??
  "/private/tmp/claude-501/-Users-adrianschimizzi-Documents-GitHub-trackd-co-app/c8a25fb1-b430-403c-8b43-871524985417/scratchpad";

export const LEDGER_FILE = path.join(STATE_DIR, "lifetime-ledger.json");
export const STATE_FILE = path.join(STATE_DIR, "lifetime-state.json");

export interface DiskLedger {
  users: string[];
  customers: string[];
  clocks: string[];
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * ⚠️ WRITTEN AND FSYNCED BEFORE THE CALLER DOES ANYTHING ELSE WITH THE ID.
 *
 * The window this closes is the one that matters: an id that exists in Stripe and
 * has not reached the file yet is an id nothing can find after a crash.
 */
function writeJsonDurably(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function loadLedger(): DiskLedger {
  return readJson<DiskLedger>(LEDGER_FILE, { users: [], customers: [], clocks: [] });
}

/** Record an id BEFORE it can be lost. Idempotent. */
export function recordId(kind: keyof DiskLedger, id: string): string {
  if (!id) throw new Error(`recordId: refusing to record an empty ${kind} id`);
  const ledger = loadLedger();
  if (!ledger[kind].includes(id)) ledger[kind].push(id);
  writeJsonDurably(LEDGER_FILE, ledger);
  return id;
}

/* ─────────────────────────── the run's state ─────────────────────────── */

export interface LifetimeState {
  /** The one account. */
  userId?: string;
  email?: string;
  /** The one Stripe customer, pinned to the one clock. */
  customerId?: string;
  clockId?: string;
  /** The subscription the app itself created at leg 1. */
  subId?: string;
  /** The clock's frozen instant at leg 1, in ms. Every leg is `t0 + n days`. */
  t0Ms?: number;
  /** The resubscribe subscription from leg 11, if it got that far. */
  resubId?: string;
  /** Recorded findings and observations, appended as the arc runs. */
  legs?: Record<string, unknown>;
  notes?: Record<string, unknown>;
}

export function loadState(): LifetimeState {
  return readJson<LifetimeState>(STATE_FILE, {});
}

export function saveState(patch: Partial<LifetimeState>): LifetimeState {
  const next = { ...loadState(), ...patch };
  writeJsonDurably(STATE_FILE, next);
  return next;
}

export const DAY_MS = 86_400_000;

/**
 * WHERE THE CLOCK STARTS, and the arithmetic is the instrument decision above.
 *
 * The arc's failed renewal lands at `t0 + 35d` and `markPastDue` writes
 * `active_until = unpaid period start + 3 days`, so access ends at `t0 + 38d`.
 * Putting that a chosen number of minutes AFTER the run's real start is what makes
 * both sides of leg 10's boundary observable.
 */
export function plannedT0(nowMs: number, graceLandsInMinutes = 55): number {
  return nowMs + graceLandsInMinutes * 60_000 - 38 * DAY_MS;
}

/* ─────────────────────────── assertions ─────────────────────────── */

export interface Check {
  leg: string;
  name: string;
  pass: boolean;
  detail: string;
}

/**
 * ⚠️ A FAILED ASSERTION DOES NOT STOP THE ARC.
 *
 * The value of this run is continuity, so an assertion that fails at leg 4 must
 * not cost legs 5 to 11 — the whole reason for a lifetime is to see what a defect
 * does to the states DOWNSTREAM of it. Failures are recorded and the arc carries
 * on; only an exception that leaves the account unusable stops it.
 */
export class Checks {
  readonly all: Check[] = [];
  leg = "?";

  at(leg: string): void {
    this.leg = leg;
    console.log(`\n──────── ${leg} ────────`);
  }

  check(name: string, pass: boolean, detail = ""): boolean {
    this.all.push({ leg: this.leg, name, pass, detail });
    console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
    return pass;
  }

  /**
   * ⚠️ ARRIVAL. Assert you REACHED the state before asserting anything about it.
   *
   * "A scenario that never reaches the state it names is worse than no scenario"
   * — six times on this branch, twice inside this harness. Named separately so a
   * failed arrival is legible as "this leg proved nothing" rather than as one more
   * red line among many.
   */
  arrived(name: string, pass: boolean, detail = ""): boolean {
    return this.check(`ARRIVAL: ${name}`, pass, detail);
  }

  summary(): { passed: number; failed: number } {
    const passed = this.all.filter((c) => c.pass).length;
    return { passed, failed: this.all.length - passed };
  }
}

/* ─────────────────────────── dates ─────────────────────────── */

/**
 * The house date format. ⚠️ `en-AU` abbreviates September with FOUR letters
 * ("Sept") and does not abbreviate June or July at all, which is what made two
 * date-SHAPE controls vacuous for a quarter of the year. Assert a date against its
 * SOURCE using this, never against `/\d{1,2}\s\w{3}\s\d{4}/`.
 */
export function day(iso: string | number | Date, tz = "Australia/Sydney"): string {
  const at =
    typeof iso === "number"
      ? new Date(iso)
      : iso instanceof Date
        ? iso
        : new Date(Date.parse(iso));
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(at);
}

export const secondsToIso = (s: number): string => new Date(s * 1000).toISOString();

/* ─────────────────────────── the app's own webhook ─────────────────────────── */

function webhookSecret(): string {
  const secret =
    process.env.STRIPE_WEBHOOK_SECRET ??
    (() => {
      const text = fs.readFileSync(
        path.join(process.cwd(), ".env.local"),
        "utf8",
      );
      const m = /^\s*STRIPE_WEBHOOK_SECRET\s*=\s*(.*)\s*$/m.exec(text);
      return m?.[1]?.replace(/^["']|["']$/g, "");
    })();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}

export const BASE_URL = process.env.BASE ?? "http://localhost:3100";

/**
 * DELIVER A REAL STRIPE EVENT TO THE APP'S OWN WEBHOOK, SIGNED THE WAY STRIPE
 * SIGNS IT.
 *
 * ⚠️ THIS IS NOT A SHORTCUT AROUND THE APP — IT IS THE ONLY WAY IN. Stripe cannot
 * reach `localhost`, and the app grants access in the webhook and NOWHERE ELSE
 * ("the only thing in this codebase that grants access"). So every entitlement
 * this run asserts on is written by the app's own handler from a real Stripe
 * object, never typed in here. A driver that computes the date the app is supposed
 * to compute is a fixture wearing a costume.
 *
 * The REAL event is preferred over a synthesized envelope (see `eventsFor`), so
 * the id is Stripe's own and the run exercises `webhook_events` idempotency
 * exactly as production would.
 *
 * ⚠️ AND THAT SENTENCE MUST NOT BE READ AS "REDELIVERY WAS TESTED". IT WAS NOT.
 *
 * It means: one delivery per real event id, which is what Stripe does. It does NOT
 * mean any assertion here drove a second delivery of the same id. Nothing in the
 * three lifetime scenarios ever does — `drainEvents` is the only caller of this
 * function and it dedupes on a `seen` Set — so the `?? evt_life_...` fallback below
 * is DEAD CODE in this harness and no assertion here is vacuous because of it.
 *
 * ⚠️ BUT THE FALLBACK IS A LOADED TRAP FOR THE NEXT CALLER, and the trap has already
 * been sprung once. `scratchpad/final/lib.mjs` had the identical shape, was called
 * directly with a real event to test a redelivery, and the route answered
 * `{"received":true,"duplicate":true}` with a **200** — so the handler never ran and
 * the driver reported "the date is identical" about a request that had done nothing
 * at all. It was found only because a Group G measurement did not move when the code
 * said it should have.
 *
 * The rule that costs nothing and would have caught it: **a 200 is not proof a
 * handler ran; read the BODY.** `{"received":true}` ran, `{"received":true,
 * "duplicate":true}` did not.
 *
 * ⚠️ AND `seen` IS PER-FILE. Each of the three lifetime scenarios declares its own
 * empty Set in its own vitest process, and parts two and three drain with a
 * ten-minute lookback — so an id part one already delivered can be re-selected. It
 * is harmless (the route answers `duplicate` for anything already processed) but it
 * means a leg can deliver less than its log suggests. No assertion in those files
 * depends on a redelivery, which is what keeps it harmless.
 */
export async function deliver(
  event: Stripe.Event | { type: string; data: { object: unknown }; id?: string },
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify({
    id: event.id ?? `evt_life_${Math.random().toString(36).slice(2)}`,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: Math.floor(Date.now() / 1000),
    type: event.type,
    data: event.data,
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret(),
  });
  const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

/**
 * The REAL events Stripe raised for this customer since `sinceMs`, oldest first.
 *
 * ⚠️ ORDER IS OLDEST FIRST DELIBERATELY. Stripe guarantees no ordering in
 * production and the handlers are built to survive that — every subscription
 * handler re-reads the live object rather than trusting the payload — but
 * delivering them backwards would be testing the reordering defence rather than
 * the arc, and this run is about the arc.
 */
export async function eventsFor(
  customerId: string,
  sinceMs: number,
): Promise<Stripe.Event[]> {
  const out: Stripe.Event[] = [];
  for await (const event of stripe.events.list({
    created: { gte: Math.floor(sinceMs / 1000) - 60 },
    limit: 100,
  })) {
    const object = event.data.object as unknown as Record<string, unknown>;
    const belongs =
      object?.customer === customerId ||
      object?.id === customerId ||
      (typeof object?.customer === "object" &&
        (object.customer as { id?: string })?.id === customerId);
    if (belongs) out.push(event);
    // The listing is newest-first and account-wide; stop once we are well past
    // the window rather than paging the whole account's history.
    if (event.created < Math.floor(sinceMs / 1000) - 300) break;
  }
  return out.reverse();
}

/** Every relevant event since `sinceMs`, delivered in order. Returns what it sent. */
export async function drainEvents(
  customerId: string,
  sinceMs: number,
  seen: Set<string>,
): Promise<{ type: string; id: string; status: number }[]> {
  const events = await eventsFor(customerId, sinceMs);
  const sent: { type: string; id: string; status: number }[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const { status } = await deliver(event);
    sent.push({ type: event.type, id: event.id, status });
  }
  return sent;
}

/* ─────────────────────────── reading the truth ─────────────────────────── */

/** The mirror row. ⚠️ Read the ROW, never a handler's return value. */
export async function mirrorFor(userId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "stripe_subscription_id, status, cancel_at_period_end, trial_ends_at, current_period_end, courtesy_until",
    )
    .eq("user_id", userId);
  return { rows: data ?? null, error };
}

/** The entitlement rows. ⚠️ The table that decides access, read directly. */
export async function entitlementsFor(userId: string) {
  const { data, error } = await admin
    .from("entitlements")
    .select("source, product, active_until, is_active")
    .eq("user_id", userId);
  return { rows: data ?? null, error };
}

/**
 * ⚠️ POLL FOR THE ROW YOU ARE CREATING. `networkidle` never settles here.
 *
 * Returns the first read that satisfies `done`, or null at the deadline. The
 * caller asserts on what came back; a null is a failed ARRIVAL and never a reason
 * to write the row by hand.
 */
export async function pollFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 30_000, everyMs = 1000 } = {},
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

/* ─────────────────────────── the dev server ─────────────────────────── */

/**
 * ⚠️ THE GATE IS A COMMAND-LINE FLAG AND NEVER `.env.local` (standing Law 4).
 *
 * `dev-gate-on.sh` / `dev-gate-off.sh` are the only correct way to set it here:
 * `npx` re-execs and LOSES the variable, which produced a fully green vacuous run
 * once. They export-and-exec, and they clear `.next` first because killing a
 * Turbopack dev server mid-compile leaves a cache that serves 404 for EVERY route
 * with no compile error.
 *
 * ⚠️ A RESTART IS NOT EVIDENCE. `ps` shows argv, not env, and `pkill -f "next dev"`
 * misses the worker holding the port. The flag is proven from a POSITIVE NAMED
 * ARTEFACT in both directions — see `proveGate` — and never from this function.
 */
export async function waitForServer(timeoutMs = 180_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * IS THE READ-ONLY GATE ON? Answered from a POSITIVE NAMED ARTEFACT.
 *
 * `NO_ACCESS_LABEL` is "Read only" and it is the label `/billing`'s Access row
 * carries for an account holding no live entitlement WHEN THE GATE IS ON. With the
 * gate off the same account reads "Pro", because off, an account with no
 * entitlement genuinely has the whole product.
 *
 * ⚠️ Both strings are the screen's own furniture, so this cannot pass vacuously
 * the way a length threshold or a prose regex can: "Access" is the row's label and
 * must be present for either answer to mean anything, and the two values are
 * mutually exclusive. Returns null when the screen did not render at all, which is
 * a broken environment rather than a gate answer.
 */
export function readGateFromBilling(text: string): boolean | null {
  if (!text.includes("Access")) return null;
  if (text.includes("Read only")) return true;
  if (text.includes("Pro")) return false;
  return null;
}

export function shell(script: string): void {
  execFileSync("/bin/sh", [script], { stdio: "inherit" });
}

/* ─────────────────────────── the real card form ─────────────────────────── */

/**
 * FILL STRIPE'S OWN CARD FORM, FINDING THE FRAME BY THE FIELD IT CONTAINS.
 *
 * ⚠️ THE TRACKED ADVICE — "target the frame by TITLE, never by index" — HAS GONE
 * STALE, AND IT COST THIS RUN ITS FIRST ATTEMPT.
 *
 * `qa-start-trial.mjs` says the numeric suffix on the frame name changes every
 * load "so the title is the only stable handle". Measured 2026-08-20: Stripe now
 * mounts THREE frames titled "Secure payment input frame" — two
 * `elements-inner-accessory-target` and one `elements-inner-easel` — and only the
 * last holds the card fields. Playwright's strict mode refused the ambiguous
 * locator outright, which is the good failure; a driver using `.first()` would
 * have typed into the wrong frame and reported a dead checkout instead.
 *
 * So the frame is identified by the NAMED ARTEFACT it must contain — the `number`
 * input itself — rather than by a title, an index or a src fragment, all three of
 * which are Stripe's to change without notice. This is the same rule the harness
 * README states for controls: a named artefact, never an approximation.
 *
 * ⚠️ THE PAN IS TYPED INTO STRIPE'S OWN FORM AND NEVER SENT TO THE API. That is
 * the second of the two permitted ways to put a card on a customer; no script here
 * may pass a card number to `paymentMethods.create` or `tokens.create`.
 *
 * Returns false rather than throwing, so the caller can record a failed ARRIVAL
 * instead of losing the run.
 */
export async function fillCardForm(
  page: import("playwright").Page,
  pan: string,
  timeoutMs = 60_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const frame of page.frames()) {
      const number = frame.locator('[name="number"]');
      if (await number.count().catch(() => 0)) {
        await number.fill(pan);
        await frame.locator('[name="expiry"]').fill("12/34").catch(() => {});
        await frame.locator('[name="cvc"]').fill("123").catch(() => {});
        const zip = frame.locator('[name="postalCode"]');
        if (await zip.count().catch(() => 0)) await zip.fill("2000").catch(() => {});
        return true;
      }
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(1000);
  }
}

/** Remove an id the run has finished with, so the ledger names only what is live. */
export function dropRecordedUser(id: string): void {
  const ledger = loadLedger();
  ledger.users = ledger.users.filter((x) => x !== id);
  writeJsonDurably(LEDGER_FILE, ledger);
}
