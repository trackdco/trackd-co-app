import "server-only";

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { isFounder } from "@/lib/admin";

import type { ReconcileReport } from "./types";
import { RULES } from "./types";

/**
 * STEP 7 — ALERTING (Spec 11 §3.6, D46, D87).
 *
 * ## ⚠️ D87 — IT FIRES ON EVERY FAILING RUN, NOT ON THE EDGE
 *
 * §3.6 asks for edge-triggered alerting: "The alert fires when a rule starts
 * failing and when it stops, and the dashboard carries the standing state in
 * between." **This deliberately does not do that**, on Adrian's decision of
 * 2026-08-17, and the reasons are two:
 *
 *   1. **Edge-triggering needs the previous run's failing set persisted**, and
 *      where a reconciliation summary is persisted is **D61, which is OPEN and
 *      carries a migration**. Building storage for it here would be deciding D61
 *      by implementing it.
 *   2. **It is the wrong direction for a launch anyway.** Edge-triggered tells you
 *      once and then goes quiet while the problem persists. During launch week a
 *      rule that keeps failing should keep shouting.
 *
 * So: no new table, no migration, no persisted previous-run state. **Routed to the
 * spec chat as a deviation from §3.6**, to be reconsidered with `14` after launch
 * when D61 is decided properly.
 *
 * ## What a channel is honestly worth (§3.6, D46)
 *
 * **⚠️ There is no email system in this codebase** and building one is `17`'s
 * work. What exists is web push and the admin dashboard. D46 resolved: push for
 * the moment a rule breaks, the dashboard for the state in between, **and a
 * missing subscription fails the clean run** — which is the
 * `no-alert-device-subscribed` rule, not this file's job.
 *
 * Push reaches a founder's phone in seconds **and only if that device is
 * subscribed**. If none is, this reaches nobody, and that is stated in the run's
 * own output rather than hidden.
 */

/** What the alert attempt actually achieved. Returned so the route can say it. */
export interface AlertOutcome {
  /** Devices a notification was accepted by. Zero is a real answer, not an error. */
  delivered: number;
  /** Founder devices that were registered at all. */
  devices: number;
  /** Why nothing was sent, when nothing was. */
  reason?: "clean" | "unconfigured" | "no-devices" | "failed";
}

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@trackdco.app";

/**
 * Tell the founder, if there is anything to tell and anywhere to tell it.
 *
 * ⚠️ NEVER THROWS. A failure to alert must not turn a completed reconciliation
 * run into a 500 — the report is the valuable thing and it has already been
 * produced. Everything here is reported back as an {@link AlertOutcome} instead,
 * so "the alert went nowhere" is visible rather than swallowed.
 */
export async function alertOnReport(report: ReconcileReport): Promise<AlertOutcome> {
  // §3.6: alert on a STATE. A clean run is not a state worth waking anybody for.
  if (report.status === "clean") return { delivered: 0, devices: 0, reason: "clean" };

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { delivered: 0, devices: 0, reason: "unconfigured" };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) return { delivered: 0, devices: 0, reason: "unconfigured" };

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const founderIds: string[] = [];
    const PAGE = 200;
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) return { delivered: 0, devices: 0, reason: "failed" };
      const users = data?.users ?? [];
      founderIds.push(...users.filter((u) => isFounder(u.email)).map((u) => u.id));
      if (users.length < PAGE) break;
    }
    if (founderIds.length === 0) return { delivered: 0, devices: 0, reason: "no-devices" };

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", founderIds);
    if (error) return { delivered: 0, devices: 0, reason: "failed" };

    const devices = subs?.length ?? 0;
    if (devices === 0) return { delivered: 0, devices: 0, reason: "no-devices" };

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const message = JSON.stringify(alertMessage(report));

    let delivered = 0;
    const dead: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (row) => {
        const s = row as Record<string, unknown>;
        const sub = {
          endpoint: s.endpoint as string,
          keys: { p256dh: s.p256dh as string, auth: s.auth as string },
        };
        try {
          await webpush.sendNotification(sub, message, { timeout: 5000 });
          delivered += 1;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          // 404/410 mean the endpoint is gone. Pruned exactly as the reminder
          // runner prunes them (`runner.ts:751-757`), so a dead device does not
          // make the alert channel look healthier than it is forever.
          if (code === 404 || code === 410) dead.push(sub.endpoint);
        }
      }),
    );

    if (dead.length > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("user_id", founderIds)
        .in("endpoint", dead);
    }

    return { delivered, devices, reason: delivered === 0 ? "failed" : undefined };
  } catch {
    return { delivered: 0, devices: 0, reason: "failed" };
  }
}

/**
 * The alert itself.
 *
 * ⚠️ NOT USER-FACING COPY, and the distinction matters. Law 5 governs what a
 * CUSTOMER reads; this goes to the two founder accounts and nobody else. It says
 * the worst rule and the count, because a notification that says "something is
 * wrong" makes a person open a laptop to find out whether it can wait.
 *
 * A fixed `tag` so a rule failing for hours replaces its own notification on the
 * lock screen rather than stacking seventy-two of them. That is the part of §3.6's
 * "not one per run" that survives D87: the run still alerts every time, and the
 * phone still shows one.
 */
function alertMessage(report: ReconcileReport): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  const mode = report.mode.toUpperCase();

  if (report.status === "incomplete") {
    return {
      title: `Reconciliation could not finish (${mode})`,
      body: "It could not read everything, so it cannot say anything is fine. Run it by hand and read the output.",
      url: "/admin",
      tag: "trackd-reconcile",
    };
  }

  const worst = RULES.find((rule) => report.findings.some((f) => f.rule === rule));
  const worstCount = report.findings.filter((f) => f.rule === worst).length;
  const others = report.findings.length - worstCount;

  return {
    title: `Reconciliation found ${report.findings.length} (${mode})`,
    body: worst
      ? `Worst: ${worst} (${worstCount})${others > 0 ? `, and ${others} more` : ""}.`
      : "Findings were reported. Run it by hand and read the output.",
    url: "/admin",
    tag: "trackd-reconcile",
  };
}
