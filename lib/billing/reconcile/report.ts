/**
 * STEP 3 — THE REPORT (Spec 11 §3.5).
 *
 * "A founder reading it in ten seconds."
 *
 *   **A clean run says so plainly**, names what it checked and how many of each,
 *   states the mode it ran against, and stops.
 *
 *   **A dirty run names, for each finding: the account, the rule that broke, and
 *   the evidence** — in that order, "because the account is what a person acts
 *   on, the rule is what tells them how bad it is, and the evidence is what they
 *   paste into the Stripe dashboard."
 *
 * ## ⚠️ NEVER A WALL OF JSON
 *
 * §3.5 forbids it outright: "A dump is a thing nobody reads, and a report nobody
 * reads is the silence this spec exists to end." So this renders text, findings
 * are grouped by rule and ordered worst first, and **a rule with three hundred
 * findings says so rather than printing three hundred lines**.
 *
 * Pure. Takes a snapshot, findings and an instant; returns a report and a string.
 * The route stamps the instant; nothing here reads a clock.
 */

import type {
  Finding,
  ReconcileReport,
  ReconcileSnapshot,
  RuleId,
  RunStatus,
} from "./types";
import { RULES, severityOf } from "./types";

/**
 * How many findings of ONE rule are printed before the rest become a count.
 *
 * ⚠️ ADAPTIVE, AND THE REASON IS WHAT THE FIRST RENDER LOOKED LIKE. A flat cap of
 * ten printed 148 unattributable webhooks as ten four-line entries — fifty lines
 * of near-identical text that pushed "a live subscription is on a price we no
 * longer sell" and the missing-alert-device finding off the bottom of the screen.
 * That is §3.5's flood arriving under the cap meant to stop it.
 *
 * So a large group prints {@link SAMPLE_OF_MANY} examples and a count. Above
 * twenty, every finding of one rule is the same shape and three of them show it
 * as well as ten do; below twenty, they are individual accounts worth reading.
 */
const MANY = 20;
const SAMPLE_OF_MANY = 3;
const MAX_LINES_PER_RULE = 10;

function printLimitFor(groupSize: number): number {
  return groupSize > MANY ? SAMPLE_OF_MANY : MAX_LINES_PER_RULE;
}

/** What each rule is, in a line, and where it came from. */
const RULE_TITLES: Record<RuleId, { title: string; source: string }> = {
  "charge-inside-grace": {
    title: "SOMEBODY WAS CHARGED INSIDE A PROMISED FREE PERIOD",
    source: "§3.1 #6, from 01 and 06 — Invariant 1",
  },
  "charge-inside-courtesy": {
    title: "SOMEBODY WAS CHARGED INSIDE A COURTESY PERIOD",
    source: "§3.1 #7, from 04 — Invariant 1",
  },
  "courtesy-granted-while-unpaid": {
    title: "A COURTESY PERIOD WAS GRANTED ON AN UNPAID SUBSCRIPTION",
    source: "§3.1 #11, D75 — D70 should have refused this",
  },
  "free-period-marker-missing": {
    title: "A FREE PERIOD IS MISSING ITS MARKER, SO A MONEY RULE IS BLIND TO IT",
    source: "§3.1 ⚠️ — a removed marker must fail loudly, not go quiet",
  },
  "two-billable-subscriptions": {
    title: "ONE ACCOUNT HOLDS TWO SUBSCRIPTIONS THAT CAN BOTH TAKE MONEY",
    source: "§3.1 #1",
  },
  "live-subscription-without-entitlement": {
    title: "SOMEBODY IS PAYING AND THE APP IS GIVING THEM NOTHING",
    source: "§3.1 #3",
  },
  "revoked-entitlement-beside-live-subscription": {
    title: "A DISPUTED ACCOUNT IS STILL BEING BILLED — THE CANCEL DID NOT LAND",
    source: "§3.4 as corrected — a dispute cancels, so this state means it failed",
  },
  "entitlement-without-source": {
    title: "SOMEBODY HAS ACCESS WITH NOTHING PAYING FOR IT",
    source: "§3.1 #2",
  },
  "charge-and-entitlement-dates-disagree": {
    title: "A CHARGE DATE AND THE DATE ON SCREEN DISAGREE",
    source: "§3.1 #5, bounded by D72 and D88",
  },
  "incomplete-past-window-with-entitlement": {
    title: "AN EXPIRED INCOMPLETE SUBSCRIPTION STILL CARRIES ACCESS",
    source: "§3.1 #8, from 02a — window measured at ~23h (e8dc9b0)",
  },
  "unexplained-zero-invoice": {
    title: "A ZERO-DOLLAR INVOICE NOBODY CAN ACCOUNT FOR",
    source: "§3.1 #12, from 19 — reported as unattributed",
  },
  "webhook-unattributed": {
    title: "WEBHOOK EVENTS WE COULD NOT TIE TO AN ACCOUNT",
    source: "§3.1 #4, §3.3 — a paying customer nobody is being told about",
  },
  "webhook-unprocessed": {
    title: "WEBHOOK EVENTS WHOSE HANDLER DID NOT FINISH",
    source: "§3.1 #4, §3.3 — attributable, so this is a handler fault",
  },
  "subscription-on-archived-price": {
    title: "A LIVE SUBSCRIPTION IS ON A PRICE WE NO LONGER SELL",
    source: "§3.1 #9",
  },
  "duplicate-entitlement-source": {
    title: "TWO ENTITLEMENTS SHARE ONE SOURCE ON ONE ACCOUNT",
    source: "§3.1 #10 — the unique constraint should have refused this",
  },
  "no-alert-device-subscribed": {
    title: "NO FOUNDER DEVICE IS SUBSCRIBED, SO ALERTS REACH NOBODY",
    source: "D46 — a missing subscription fails the clean run",
  },
};

/**
 * Assemble the report.
 *
 * ## ⚠️ INCOMPLETE OUTRANKS EVERYTHING, INCLUDING DIRTY
 *
 * §3.2: "a run that hit a page limit reports itself as incomplete rather than
 * reporting clean." §3.9 puts it harder — "a reconciliation script that breaks
 * silently is strictly worse than none, because the word 'clean' starts meaning
 * 'did not run'."
 *
 * So incompleteness is the status even when there are findings, because the
 * finding list is then known to be partial and "here are the 3 problems" would
 * be a claim this run cannot support. The findings are still printed in full —
 * they are true, they are just not all of them.
 */
export function buildReport(
  snapshot: ReconcileSnapshot,
  findings: Finding[],
  ranAt: string,
): ReconcileReport {
  const incomplete =
    snapshot.completeness.truncated.length > 0 ||
    snapshot.completeness.failed.length > 0;

  const status: RunStatus = incomplete
    ? "incomplete"
    : findings.length > 0
      ? "dirty"
      : "clean";

  return {
    status,
    mode: snapshot.mode,
    ranAt,
    findings: [...findings].sort((a, b) => severityOf(a.rule) - severityOf(b.rule)),
    completeness: snapshot.completeness,
    counts: {
      subscriptions: snapshot.subscriptions.length,
      invoices: snapshot.invoices.length,
      stripeCustomers: snapshot.stripeCustomers.length,
      entitlements: snapshot.entitlements.length,
      customers: snapshot.customers.length,
      unstampedWebhooks: snapshot.unstampedWebhooks.length,
    },
  };
}

/**
 * THE EXIT STATE, so a scheduled run can be acted on without parsing prose.
 *
 * §3.5, and §12's "twice clean" gate depends on it being a fact rather than a
 * judgement. 0 clean, 1 dirty, 2 incomplete — and 2 rather than 0 for incomplete
 * is the whole point: a run that could not see everything must not satisfy a gate
 * that means "we looked and it was fine".
 */
export function exitCodeFor(status: RunStatus): 0 | 1 | 2 {
  if (status === "clean") return 0;
  if (status === "dirty") return 1;
  return 2;
}

/** Render the whole thing as text a person reads. */
export function renderReport(report: ReconcileReport): string {
  const lines: string[] = [];
  const mode = report.mode.toUpperCase();

  lines.push("TRACKD CO — RECONCILIATION");
  lines.push(`${mode} MODE · ran ${report.ranAt}`);
  /**
   * ⚠️ THE MODE IS STATED BEFORE THE VERDICT, ALWAYS. §3.2: "a test-mode run is
   * never evidence for a live-mode conclusion." Somebody skimming for the word
   * CLEAN must not be able to reach it before reading which world it is about.
   */
  if (report.mode === "test") {
    lines.push("⚠️ TEST MODE. This is not evidence about live money.");
  }
  lines.push("");

  if (report.status === "clean") {
    lines.push("CLEAN. Nothing to act on.");
    lines.push("");
    lines.push(checkedLine(report));
    lines.push(`All ${RULES.length} rules ran and none of them broke.`);
    return lines.join("\n");
  }

  if (report.status === "incomplete") {
    lines.push("⚠️ INCOMPLETE. THIS RUN IS NOT EVIDENCE THAT ANYTHING IS FINE.");
    lines.push("");
    lines.push("It could not see everything it needed, so it cannot say clean:");
    for (const t of report.completeness.truncated) lines.push(`  · hit a limit — ${t}`);
    for (const f of report.completeness.failed) lines.push(`  · could not read — ${f}`);
    lines.push("");
    if (report.findings.length === 0) {
      lines.push("No findings in what it DID see — but that list is known to be partial.");
      lines.push("");
      lines.push(checkedLine(report));
      return lines.join("\n");
    }
    lines.push(
      `${report.findings.length} finding(s) in what it DID see. The list is partial.`,
    );
  } else {
    lines.push(
      `${report.findings.length} FINDING(S) across ${countRules(report.findings)} rule(s). Worst first.`,
    );
  }

  for (const rule of RULES) {
    const group = report.findings.filter((f) => f.rule === rule);
    if (group.length === 0) continue;

    const meta = RULE_TITLES[rule];
    lines.push("");
    lines.push(`━━ ${meta.title}  (${group.length})`);
    lines.push(`   ${meta.source}`);

    const limit = printLimitFor(group.length);
    for (const finding of group.slice(0, limit)) {
      lines.push("");
      // ACCOUNT FIRST. §3.5's order is what a person acts on, then how bad, then
      // what to paste.
      lines.push(`   ${accountLine(finding)}`);
      for (const line of finding.evidence) lines.push(`     ${line}`);
    }

    if (group.length > limit) {
      /**
       * ⚠️ COUNTED, NOT FLOODED. §3.5: "a run with three hundred findings of one
       * kind says so rather than printing three hundred lines." The remainder is
       * still IN the report object, so `14`'s dashboard and any JSON consumer see
       * every one; it is the terminal rendering that stops.
       */
      lines.push("");
      lines.push(`     … and ${group.length - limit} more of the same. Not printed.`);
    }
  }

  lines.push("");
  lines.push(checkedLine(report));
  return lines.join("\n");
}

function countRules(findings: Finding[]): number {
  return new Set(findings.map((f) => f.rule)).size;
}

/**
 * WHO, by ids rather than by email address.
 *
 * A Supabase user id and a Stripe customer id are both directly pasteable into
 * the two consoles a person would actually open. A cold review already downgraded
 * the backfill for returning every account's address in one response, and this
 * report goes to a dashboard and a push notification.
 */
function accountLine(finding: Finding): string {
  const account = finding.account;
  if (!account) return "account  (not about a specific account)";
  const parts: string[] = [];
  parts.push(account.userId ? `user ${account.userId}` : "user UNKNOWN");
  if (account.stripeCustomerId) parts.push(`customer ${account.stripeCustomerId}`);
  return `account  ${parts.join(" · ")}`;
}

/** What it looked at, so "clean" is a claim with a size attached to it. */
function checkedLine(report: ReconcileReport): string {
  const c = report.counts;
  const parts = [
    plural(c.subscriptions, "subscription"),
    plural(c.invoices, "invoice"),
    plural(c.stripeCustomers, "Stripe customer"),
    plural(c.entitlements, "entitlement"),
    plural(c.customers, "customer link"),
    `${plural(c.unstampedWebhooks, "unstamped webhook")} (this mode)`,
  ];
  return `checked  ${parts.join(" · ")}`;
}

/** "1 invoice", not "1 invoices". This is a line a person reads. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
