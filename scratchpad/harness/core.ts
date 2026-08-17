/**
 * THE TEST-CLOCK HARNESS — shared machinery for spec 04 Steps 9, 10 and 11, and
 * for Monday's three observations.
 *
 * ## ⚠️ THE DATABASE IS PRODUCTION, WITH ~90 REAL USERS
 *
 * Every account this file creates is on `@trackd-qa.invalid`, is recorded in a
 * ledger, and is deleted BY ID. **Nothing here ever matches on a domain, an email
 * pattern, or a `like`.** A previous agent's domain-wide sweep destroyed sixteen
 * real fixtures, and {@link Ledger} exists so that cannot be repeated: it is the
 * only thing teardown reads.
 *
 * ## ⚠️ SPENDING STRIPE OBJECTS IS OPT-IN AND OFF BY DEFAULT
 *
 * {@link requireStripeBudget} throws unless `HARNESS_ALLOW_STRIPE=1`. That is not
 * politeness: more than one session works this tree, and two of them creating and
 * tearing down test clocks and customers at once collide on cleanup — one
 * teardown deletes a customer the other is mid-way through advancing. Anything
 * that reaches Stripe goes through that guard, so a scenario run with the guard
 * unset does the database half and refuses the rest LOUDLY rather than silently
 * skipping it.
 *
 * ## What is here and why
 *
 * - {@link seedAccount}      an account, with a mirror row and entitlement, ledgered
 * - {@link PushSink}         a real HTTP endpoint that captures real web-push sends
 * - {@link fireReminder}     `runForUser` at an INJECTED instant — see below
 * - {@link readOfferMarkers} the once-ever offer's Stripe-side markers
 * - {@link TestClock}        Stripe test-clock lifecycle (guarded)
 *
 * ## ⚠️ THE ANSWER TO "CAN WE INJECT A CLOCK?" IS YES
 *
 * `runForUser(supabase, userId, { force?, now? })` takes an optional `now` and
 * falls back to `new Date()` (`lib/notifications/runner.ts:695-701`). It threads
 * that instant into `collectUserData` and on into `trialReminderVerdict(trial, tz,
 * now, sentFor)`, which is pure. So the reminder half of every observation below
 * needs NO Stripe test clock at all: a seeded `trial_ends_at` plus an injected
 * `now` reproduces any moment we like, deterministically and in milliseconds.
 *
 * The production cron never passes it — `app/api/notifications/run/route.ts` calls
 * `runForUser(supabase, id, { force: false })` — so real time still governs in
 * production and this adds no surface there.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { runForUser } from "@/lib/notifications/runner";

/* ─────────────────────────── environment ─────────────────────────── */

function env(): Record<string, string> {
  // `.env.local` is the founder's real environment; the harness reads it rather
  // than carrying a second copy of any key.
  const fs = require("node:fs") as typeof import("node:fs");
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const file of [".env.local", ".env"]) {
    try {
      const text = fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const line of text.split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* absent is fine; the vars may already be exported */
    }
  }
  return out;
}

const E = env();

export const BASE = process.env.BASE ?? "http://localhost:3100";

/**
 * ⚠️ COMPARE TIMESTAMPS AS INSTANTS. THIS IS THE ONLY SHAPE ON OFFER.
 *
 * Postgres returns `+00:00` where JS writes `.000Z`, so two identical moments are
 * UNEQUAL as strings. It is listed in the README as a trap that had already cost a
 * run — and it then cost two more in one session, with a local helper already
 * written in a neighbouring scenario.
 *
 * **Twice with a fix in reach means the fix was not being reached for.** So it
 * lives here, beside `admin` and `stripe`, where a scenario meets it before it
 * writes its own comparison. Prefer it over `Date.parse(a) === Date.parse(b)` for
 * the same reason `survivorOf` is a function rather than an inline sort: a rule
 * everybody has to remember is a rule somebody will not.
 */
export function sameInstant(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

/** `a` is strictly earlier than `b`. Same reasoning as {@link sameInstant}. */
export function earlierThan(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return Date.parse(a) < Date.parse(b);
}

/**
 * ⚠️ THE QA FIXTURE PASSWORD LIVES IN `.env.local`, NOT HERE (D89).
 *
 * Only ever used on `@trackd-qa.invalid` accounts torn down by id, so it is low
 * risk — but the harness is TRACKED, and a credential in a repository is a
 * question somebody has to answer later.
 */
export const QA_PASSWORD: string = E.QA_TEST_PASSWORD ?? "";
if (!QA_PASSWORD) throw new Error("QA_TEST_PASSWORD is not set in .env.local");

/** ⚠️ Service role. Reads and writes other users' rows. Never leaves this file's callers. */
export const admin: SupabaseClient = createClient(
  E.NEXT_PUBLIC_SUPABASE_URL,
  E.SUPABASE_SECRET_KEY ?? E.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const stripe = new Stripe(E.STRIPE_SECRET_KEY ?? "", { apiVersion: "2025-08-27.basil" as never });

/**
 * ⚠️ THE GUARD. Anything that creates a Stripe object calls this first.
 *
 * Unset means "another session owns Stripe right now". The throw names what was
 * being attempted so a half-run scenario reports which half it did.
 */
export function requireStripeBudget(what: string): void {
  if (E.HARNESS_ALLOW_STRIPE !== "1") {
    throw new Error(
      `REFUSED: ${what} would create Stripe objects and HARNESS_ALLOW_STRIPE is not "1". ` +
        `Set it only when no other session is spending Stripe test objects.`,
    );
  }
}

export const stripeBudgetAvailable = (): boolean => E.HARNESS_ALLOW_STRIPE === "1";

/* ─────────────────────────── the ledger ─────────────────────────── */

/**
 * Everything created, in creation order, torn down in reverse.
 *
 * ⚠️ Teardown reads ONLY this. There is no query anywhere in the harness that
 * selects accounts to delete, because a query is how a domain sweep happens.
 */
export class Ledger {
  private users: string[] = [];
  private customers: string[] = [];
  private clocks: string[] = [];

  user(id: string) { this.users.push(id); return id; }
  customer(id: string) { this.customers.push(id); return id; }
  clock(id: string) { this.clocks.push(id); return id; }

  /**
   * ⚠️ STRIPE FIRST, THEN THE ACCOUNT, and the order is not negotiable.
   *
   * `billing_customers` cascades away with the profile, and it is the only
   * mapping from a Stripe customer back to a user. Delete the account first and
   * any subscription left behind bills a person nothing can attribute the charge
   * to. Same ordering `lib/billing/cancel.ts` argues for on the real path.
   */
  async teardown(): Promise<void> {
    for (const customerId of [...this.customers].reverse()) {
      try {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
        for (const s of subs.data) {
          if (["canceled", "incomplete_expired"].includes(s.status)) continue;
          await stripe.subscriptions.cancel(s.id).catch((e) => console.warn(`  cancel ${s.id}: ${e.message}`));
        }
        await stripe.customers.del(customerId).catch((e) => console.warn(`  del ${customerId}: ${e.message}`));
      } catch (e) {
        console.warn(`  stripe teardown ${customerId}: ${(e as Error).message}`);
      }
    }
    for (const clockId of [...this.clocks].reverse()) {
      await stripe.testHelpers.testClocks.del(clockId).catch((e) => console.warn(`  clock ${clockId}: ${e.message}`));
    }
    for (const id of [...this.users].reverse()) {
      if (!id) throw new Error("ledger holds an empty id; refusing to call deleteUser");
      await admin.auth.admin.deleteUser(id).catch((e) => console.warn(`  user ${id}: ${e.message}`));
    }
    this.users = []; this.customers = []; this.clocks = [];
  }
}

/* ─────────────────────────── seeding ─────────────────────────── */

export interface SeedOptions {
  /** ISO instant for `subscriptions.trial_ends_at`. Implies a `trialing` mirror row. */
  trialEndsAt?: string;
  /** ISO instant for `subscriptions.current_period_end`. */
  currentPeriodEnd?: string;
  status?: "trialing" | "active" | "past_due";
  cancelAtPeriodEnd?: boolean;
  /** A free-for-life comp entitlement (`active_until` null). */
  comp?: boolean;
  /** An entitlement expiring at this ISO instant (the beta fortnight shape). */
  graceUntil?: string;
  timezone?: string;
  /** `notification_preferences.reminder_time`, default 09:00. */
  reminderTime?: string;
  notificationsEnabled?: boolean;
}

export interface SeededAccount {
  id: string;
  email: string;
  password: string;
  subscriptionId?: string;
}

/**
 * An account in a chosen billing state, with NO Stripe object.
 *
 * `/billing`, the reminder runner and the read-only gate all read the MIRROR and
 * the entitlement rather than Stripe, so most of what these scenarios assert can
 * be reproduced without spending anything. Only the offer's own markers (which
 * live on the Stripe customer) and a real charge need the guarded path.
 */
export async function seedAccount(
  ledger: Ledger,
  tag: string,
  opts: SeedOptions = {},
): Promise<SeededAccount> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const password = QA_PASSWORD;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`seedAccount: ${error.message}`);
  const id = ledger.user(data.user.id);

  await admin.from("profiles").update({
    is_18_plus: true,
    tos_accepted_at: new Date().toISOString(),
    date_of_birth: "1990-01-01",
    timezone: opts.timezone ?? "Australia/Sydney",
    notifications_enabled: opts.notificationsEnabled ?? true,
  }).eq("id", id);

  await admin.from("notification_preferences").upsert(
    {
      user_id: id,
      reminder_time: opts.reminderTime ?? "09:00:00",
      quiet_start: "22:00:00",
      quiet_end: "08:00:00",
      trial_reminder_sent_for: null,
    },
    { onConflict: "user_id" },
  );

  let subscriptionId: string | undefined;
  if (opts.trialEndsAt || opts.currentPeriodEnd || opts.status) {
    subscriptionId = `sub_harness_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { error: mErr } = await admin.from("subscriptions").insert({
      user_id: id,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: "price_harness",
      status: opts.status ?? (opts.trialEndsAt ? "trialing" : "active"),
      cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      trial_ends_at: opts.trialEndsAt ?? null,
      current_period_end: opts.currentPeriodEnd ?? opts.trialEndsAt ?? null,
    });
    if (mErr) throw new Error(`seedAccount mirror: ${mErr.message}`);
  }

  if (opts.comp || opts.graceUntil) {
    const { error: eErr } = await admin.from("entitlements").upsert(
      {
        user_id: id,
        product: "pro",
        source: "comp",
        active_until: opts.comp ? null : opts.graceUntil,
        is_active: true,
      },
      { onConflict: "user_id,product,source" },
    );
    if (eErr) throw new Error(`seedAccount entitlement: ${eErr.message}`);
  }

  return { id, email, password, subscriptionId };
}

/** Move the mirror's trial end, which is what a courtesy grant does to it. */
export async function moveTrialEnd(userId: string, iso: string): Promise<void> {
  const { error } = await admin
    .from("subscriptions")
    .update({ trial_ends_at: iso, current_period_end: iso })
    .eq("user_id", userId);
  if (error) throw new Error(`moveTrialEnd: ${error.message}`);
}

export async function readStamp(userId: string): Promise<string | null> {
  const { data } = await admin
    .from("notification_preferences")
    .select("trial_reminder_sent_for")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.trial_reminder_sent_for as string | null) ?? null;
}

/* ─────────────────────────── the push sink ─────────────────────────── */

/**
 * A self-signed certificate for the sink, generated once and cached.
 *
 * Written under `scratchpad/`, which is untracked, so no key material reaches
 * the repository. It is valid only for 127.0.0.1 and only ever terminates the
 * harness's own loopback connections.
 */
function ensureCert(): { key: string; cert: string } {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".certs");
  const keyPath = path.join(dir, "sink-key.pem");
  const certPath = path.join(dir, "sink-cert.pem");
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath, "-out", certPath,
      "-days", "3650", "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1",
    ], { stdio: "ignore" });
  }
  return { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certPath, "utf8") };
}

export interface CapturedPush {
  at: Date;
  bytes: number;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * A REAL push endpoint, on localhost, that records what web-push actually sends.
 *
 * `sendPushes` posts to whatever `push_subscriptions.endpoint` holds
 * (`lib/notifications/runner.ts:661`), so pointing a row here captures a genuine
 * delivery: real VAPID signing, real payload encryption, real HTTP. That is what
 * makes "a reminder verifiably fired" an observation rather than an inference.
 *
 * The payload is NOT decrypted. Proving the bytes left the server under a valid
 * signature is the claim; reading them would need the subscription's private key
 * and would prove nothing further about whether the send happened.
 */
export class PushSink {
  private server?: https.Server;
  readonly received: CapturedPush[] = [];
  url = "";

  /**
   * ⚠️ HTTPS, NOT HTTP, AND THAT IS NOT OPTIONAL.
   *
   * `web-push` speaks TLS to whatever endpoint it is given, unconditionally. A
   * plain `http.createServer` sink fails with
   *
   *     write EPROTO ... tls_validate_record_header: wrong version number
   *
   * which the runner swallows into `trialReminder: "send-failed"` — so the
   * scenario reads as "the reminder did not fire" when in fact the verdict was
   * correct and only the harness's own socket was wrong. Measured on the first
   * run; the distinction is the entire value of this file.
   *
   * The certificate is self-signed and regenerated on demand into an ignored
   * directory. `setup.ts` disables TLS verification for the harness process only.
   */
  async start(): Promise<void> {
    const { key, cert } = ensureCert();
    this.server = https.createServer({ key, cert }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        this.received.push({
          at: new Date(),
          bytes: Buffer.concat(chunks).length,
          headers: req.headers,
        });
        // 201 is what a real push service answers. Anything else and the runner
        // treats the endpoint as failed (404/410 would delete the row).
        res.writeHead(201).end();
      });
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    const { port } = this.server!.address() as AddressInfo;
    this.url = `https://127.0.0.1:${port}/push`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server?.close(() => r()));
  }

  clear(): void { this.received.length = 0; }
}

/**
 * Register a push subscription for a user, pointing at the sink.
 *
 * The keys are a genuine P-256 keypair and a 16-byte auth secret, because
 * web-push ENCRYPTS to them: a placeholder string fails inside the library and
 * the scenario would then be measuring the harness rather than the runner.
 */
export async function registerPush(userId: string, endpoint: string): Promise<void> {
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-65);
  const { error } = await admin.from("push_subscriptions").insert({
    user_id: userId,
    endpoint,
    p256dh: raw.toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  });
  if (error) throw new Error(`registerPush: ${error.message}`);
}

/* ─────────────────────────── the reminder probe ─────────────────────────── */

export interface ReminderOutcome {
  /** `RunResult.trialReminder` — the reason string, or the date sent for. */
  trialReminder?: string;
  sent: number;
  reason?: string;
  /** `notification_preferences.trial_reminder_sent_for` AFTER the run. */
  stampAfter: string | null;
  /** Pushes captured by the sink during this run. */
  delivered: number;
}

/**
 * Run the real reminder engine at an instant of our choosing.
 *
 * ⚠️ THIS IS THE WHOLE ANSWER TO THE TEST-CLOCK PROBLEM. A Stripe test clock
 * moves STRIPE's clock; it does not move the server's, and the runner counts back
 * two days from the stored end date using the server's. Injecting `now` here
 * removes the need for the two to agree at all: the mirror supplies the end date,
 * this supplies the moment, and the pure verdict does the rest.
 */
export async function fireReminder(
  userId: string,
  now: Date,
  sink?: PushSink,
): Promise<ReminderOutcome> {
  const before = sink?.received.length ?? 0;
  const result = await runForUser(admin as never, userId, { now });
  return {
    trialReminder: result.trialReminder,
    sent: result.sent,
    reason: result.reason,
    stampAfter: await readStamp(userId),
    delivered: (sink?.received.length ?? 0) - before,
  };
}

/**
 * The user-local instant at `hh:mm` on the day `daysBefore` days before `endIso`.
 * Mirrors what the runner computes, so a scenario can say "the promised day".
 *
 * ⚠️ THE OFFSET IS RESOLVED FOR THAT ACTUAL DAY, NOT ASSUMED.
 *
 * A fixed `-10` for Australia/Sydney is right for eight months of the year and
 * an hour wrong for the other four: AEDT starts in early October, and these
 * scenarios deliberately seed trials weeks out, so a run in late September and
 * the same run in November would land on different local days. An hour's error
 * either side of a reminder time is exactly the difference between "fired" and
 * "too-early", which would make the harness itself the flaky part.
 */
export function atLocalTime(
  endIso: string,
  daysBefore: number,
  hhmm = "09:05",
  tz = "Australia/Sydney",
): Date {
  const target = new Date(Date.parse(endIso) - daysBefore * 86_400_000);
  const [h, m] = hhmm.split(":").map(Number);

  // The local calendar day `daysBefore` before the ending.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(target);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const dayKey = `${get("year")}-${get("month")}-${get("day")}`;

  // Solve for the UTC instant whose local wall time is `dayKey hh:mm`. One
  // correction pass is enough: the offset is constant either side of a DST jump,
  // and a jump within the same hour is not a case any reminder time can hit.
  let guess = Date.parse(`${dayKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  for (let i = 0; i < 2; i += 1) {
    const offset = offsetMinutes(new Date(guess), tz);
    guess = Date.parse(`${dayKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`)
      - offset * 60_000;
  }
  return new Date(guess);
}

/** Minutes east of UTC for `tz` at `at`. */
function offsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/* ─────────────────────────── offer markers ─────────────────────────── */

/**
 * The once-ever offer's state, read from where it actually lives.
 *
 * Availability is decided by the SHOWN marker alone (`saveOffer.ts`), so Step 9's
 * four routes all reduce to one question this answers: is `shownAt` set, and is
 * it the same value it was before?
 */
export async function readOfferMarkers(customerId: string): Promise<{
  shownAt?: string;
  claimedAt?: string;
  courtesyUntil?: string;
}> {
  requireStripeBudget("reading the offer markers");
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) throw new Error("customer is deleted");
  const md = customer.metadata ?? {};
  return {
    shownAt: md["trackd_save_offer_shown_at"],
    claimedAt: md["trackd_save_offer_claimed_at"],
    courtesyUntil: md["trackd_courtesy_until"],
  };
}

/* ─────────────────────────── Stripe test clocks ─────────────────────────── */

/**
 * A Stripe test clock, and a customer and subscription living on it.
 *
 * ⚠️ EVERY METHOD IS GUARDED. Built tonight, run in the morning.
 *
 * A clock is the only way to observe the two things that cannot be faked from the
 * mirror: that the courtesy period actually ends in a CHARGE on the day the
 * dialog named, and what Stripe's own trial-ending email does when `trial_end`
 * moves mid-cycle (Q79).
 */
export class TestClock {
  id = "";
  constructor(private ledger: Ledger) {}

  async create(frozenAt: Date): Promise<string> {
    requireStripeBudget("creating a test clock");
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(frozenAt.getTime() / 1000),
    });
    this.id = this.ledger.clock(clock.id);
    return this.id;
  }

  /**
   * Advance and WAIT for Stripe to finish settling, which is not instant.
   *
   * ⚠️ IT HOPS, BECAUSE STRIPE CAPS A SINGLE ADVANCE AT TWO BILLING INTERVALS.
   *
   * Measured 2026-08-17 on a WEEKLY subscription, asking for a fourteen-day-plus
   * -two-hour jump to land just past a courtesy period:
   *
   *     The frozen time of this clock is ... You can only advance it up to ...
   *     You can only advance a test clock up to two intervals from the current
   *     frozen time at a time, based on the shortest subscription interval in
   *     the test clock.
   *
   * A trial plus a courtesy period is exactly two intervals, so ANY scenario
   * that wants to land *past* the ending — which is every scenario that wants to
   * observe the charge — is one hop too far by construction. Hopping in
   * `maxHopMs` steps makes that invisible to the caller instead of making each
   * one rediscover it.
   *
   * Seven days is the default because it is one weekly interval: safe for weekly
   * and far inside the cap for monthly and yearly. Each hop settles fully before
   * the next, so Stripe raises and pays the invoices in order rather than being
   * asked to collapse two cycles into one jump.
   */
  async advanceTo(when: Date, timeoutMs = 180_000, maxHopMs = 7 * 86_400_000): Promise<void> {
    requireStripeBudget("advancing a test clock");
    const target = Math.floor(when.getTime() / 1000);
    for (;;) {
      const current = await stripe.testHelpers.testClocks.retrieve(this.id);
      const from = current.frozen_time;
      if (from >= target) return;
      const next = Math.min(target, from + Math.floor(maxHopMs / 1000));
      await stripe.testHelpers.testClocks.advance(this.id, { frozen_time: next });
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const clock = await stripe.testHelpers.testClocks.retrieve(this.id);
        if (clock.status === "ready") break;
        if (clock.status === "internal_failure") throw new Error(`test clock ${this.id} failed`);
        if (Date.now() > deadline) throw new Error(`test clock ${this.id} still ${clock.status}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /** A customer pinned to this clock, with a card attached. */
  async customer(email: string): Promise<string> {
    requireStripeBudget("creating a customer on a test clock");
    const c = await stripe.customers.create({
      email,
      test_clock: this.id,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
    });
    return this.ledger.customer(c.id);
  }
}
