/**
 * The runner end to end, against a fake Supabase: hidden names, the check-up
 * switch, the one-a-day stamp, and the "Giving You Space" pause. The decisions
 * themselves are tested in `checkups.test.ts`; this is the wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sent = vi.hoisted(() => [] as Array<{ title: string; body: string; tag: string }>);

vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (_sub: unknown, payload: string) => {
      sent.push(JSON.parse(payload));
      return {};
    },
  },
}));

import { runForUser } from "@/lib/notifications/runner";

/* ------------------------------------------------------------ a fake client */

type Row = Record<string, unknown>;

interface Fake {
  tables: Record<string, Row[]>;
  /** Tables whose reads fail, and optionally only when the select names a column. */
  failing: Array<{ table: string; whenSelecting?: string }>;
  writes: Array<{ table: string; op: string; value: unknown }>;
}

function fakeClient(fake: Fake) {
  return {
    from(table: string) {
      let cols = "";
      let op: "select" | "update" | "upsert" | "delete" = "select";
      let value: unknown;
      const result = () => {
        if (op !== "select") {
          fake.writes.push({ table, op, value });
          return { data: null, error: null };
        }
        const fails = fake.failing.some(
          (f) => f.table === table && (!f.whenSelecting || cols.includes(f.whenSelecting)),
        );
        if (fails) return { data: null, error: { message: `column does not exist (${table})` } };
        return { data: fake.tables[table] ?? [], error: null };
      };
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: (c: string) => ((cols = c), q),
        update: (v: unknown) => ((op = "update"), (value = v), q),
        upsert: (v: unknown) => ((op = "upsert"), (value = v), q),
        delete: () => ((op = "delete"), q),
        eq: chain, in: chain, gte: chain, order: chain, range: chain, limit: chain,
        maybeSingle: async () => {
          const r = result();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(res, rej),
      });
      return q;
    },
  };
}

/* ------------------------------------------------------------ the account */

// 23:00 UTC on 27 Sep = 09:00 on Monday 28 Sep in Sydney, the first tick of the hour.
const NINE_AM = new Date("2026-09-27T23:00:00Z");

function account(over: { prefs?: Row; logs?: Row[]; log?: Row[] } = {}): Fake {
  return {
    tables: {
      profiles: [{ timezone: "Australia/Sydney", notifications_enabled: true, created_at: "2026-01-01T00:00:00Z", goal: null, units_preference: "metric" }],
      notification_preferences: [{
        dose_reminders_on: true, unlogged_alert_on: true, low_inventory_alert_on: true,
        reminder_time: "09:00:00", quiet_start: "22:00:00", quiet_end: "07:00:00",
        hide_compound_names: false, checkins_on: true, last_checkup_on: null,
        ...over.prefs,
      }],
      protocol_compounds: [{
        id: "pc1", schedule_type: "every_day", days_of_week: null, interval_days: null,
        first_dose_on: "2026-01-01", end_date: null, dose_times: null, compounds: { name: "BPC-157" },
      }],
      dose_logs: over.logs ?? [],
      notification_log: over.log ?? [],
      push_subscriptions: [{ endpoint: "https://push.example/1", p256dh: "k", auth: "a" }],
    },
    failing: [],
    writes: [],
  };
}

const run = (fake: Fake) =>
  runForUser(fakeClient(fake) as never, "u1", { now: NINE_AM });

beforeEach(() => {
  sent.length = 0;
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------ tests */

describe("runner: hidden names", () => {
  it("names the compound by default", async () => {
    await run(account());
    expect(sent.find((m) => m.tag === "trackd-dose-daily")?.body).toBe("BPC-157 is due today");
  });

  it("counts instead when names are hidden", async () => {
    await run(account({ prefs: { hide_compound_names: true } }));
    const dose = sent.find((m) => m.tag === "trackd-dose-daily");
    expect(dose?.body).toBe("You have 1 dose due today");
    expect(JSON.stringify(sent)).not.toContain("BPC-157");
  });

  it("still sends the reminder, naming as before, when 007 is not applied", async () => {
    const fake = account();
    fake.failing.push({ table: "notification_preferences", whenSelecting: "hide_compound_names" });
    const r = await run(fake);
    expect(r.ok).toBe(true);
    expect(sent.find((m) => m.tag === "trackd-dose-daily")?.body).toBe("BPC-157 is due today");
  });
});

describe("runner: check-ups", () => {
  // First dose logged yesterday: "Day Two" is due at 9:00.
  const yesterday = [{ protocol_compound_id: "pc1", taken_at: "2026-09-27T00:00:00Z", logged_for: "2026-09-27", status: "taken" }];

  it("stay off without NOTIFICATION_CHECKUPS", async () => {
    const r = await run(account({ logs: yesterday }));
    expect(r.checkup).toBeUndefined();
    expect(sent.some((m) => m.tag === "trackd-checkup")).toBe(false);
  });

  it("send one, then stamp the day and log the occasion", async () => {
    vi.stubEnv("NOTIFICATION_CHECKUPS", "on");
    const fake = account({ logs: yesterday });
    const r = await run(fake);
    expect(r.checkup).toBe("day-two");
    expect(sent.find((m) => m.tag === "trackd-checkup")?.title).toBe("Day Two");
    expect(fake.writes).toContainEqual({ table: "notification_preferences", op: "update", value: { last_checkup_on: "2026-09-28" } });
    expect(fake.writes).toContainEqual({
      table: "notification_log", op: "upsert", value: { user_id: "u1", key: "day-two", sent_on: "2026-09-28" },
    });
  });

  it("send none once today's has gone", async () => {
    vi.stubEnv("NOTIFICATION_CHECKUPS", "on");
    const r = await run(account({ logs: yesterday, prefs: { last_checkup_on: "2026-09-28" } }));
    expect(r.checkup).toBe("already-today");
    expect(sent.some((m) => m.tag === "trackd-checkup")).toBe(false);
  });

  it("respect the Check-ins switch", async () => {
    vi.stubEnv("NOTIFICATION_CHECKUPS", "on");
    const r = await run(account({ logs: yesterday, prefs: { checkins_on: false } }));
    expect(r.checkup).toBe("off");
  });

  it("wait for the first tick of the hour", async () => {
    vi.stubEnv("NOTIFICATION_CHECKUPS", "on");
    const r = await runForUser(fakeClient(account({ logs: yesterday })) as never, "u1", {
      now: new Date("2026-09-27T23:15:00Z"),
    });
    expect(r.checkup).toBe("not-this-tick");
  });

  it("report without sending or writing on a dry run", async () => {
    vi.stubEnv("NOTIFICATION_CHECKUPS", "on");
    const fake = account({ logs: yesterday });
    const r = await runForUser(fakeClient(fake) as never, "u1", { now: NINE_AM, dryRun: true });
    expect(r.checkup).toBe("would-send:day-two");
    expect(sent).toHaveLength(0);
    expect(fake.writes).toHaveLength(0);
  });
});

describe("runner: 'Giving You Space'", () => {
  it("keeps the dose reminder back until the next log", async () => {
    vi.stubEnv("NOTIFICATION_CHECKUPS", "on");
    const lastLog = [{ protocol_compound_id: "pc1", taken_at: "2026-09-01T00:00:00Z", logged_for: "2026-09-01", status: "taken" }];
    const r = await run(account({ logs: lastLog, log: [{ key: "quiet:21:2026-09-01" }] }));
    expect(r.checkup).toBe("paused-for-space");
    expect(sent).toHaveLength(0);
  });
});
