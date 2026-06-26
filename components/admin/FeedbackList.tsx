"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { setFeedbackResolved } from "@/lib/db/feedback";

export type AdminFeedback = {
  id: string;
  message: string;
  email: string | null;
  path: string | null;
  created_at: string;
  resolved_at: string | null;
};

/**
 * Founder /admin feedback list with a tick-to-resolve control. Resolved items
 * drop out of the open list into a collapsed "resolved" section so the list
 * stays uncrowded as fixes ship. Toggling is OPTIMISTIC (instant) and persists
 * via the founder-only `setFeedbackResolved` server action; a failed write
 * silently reverts the tick.
 */
export function FeedbackList({ items }: { items: AdminFeedback[] }) {
  const [resolved, setResolved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, Boolean(i.resolved_at)])),
  );
  const [showDone, setShowDone] = useState(false);
  const [, startTransition] = useTransition();

  const open = items.filter((i) => !resolved[i.id]);
  const done = items.filter((i) => resolved[i.id]);

  function toggle(id: string, next: boolean) {
    setResolved((prev) => ({ ...prev, [id]: next })); // optimistic
    startTransition(async () => {
      const res = await setFeedbackResolved(id, next);
      if (!res.ok) setResolved((prev) => ({ ...prev, [id]: !next })); // revert
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No feedback yet. Testers can send notes from the + menu.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <p className="text-sm text-text-muted">All caught up — nothing open.</p>
      ) : (
        <div className="space-y-2">
          {open.map((f) => (
            <FeedbackCard key={f.id} f={f} resolved={false} onToggle={toggle} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            className="text-xs uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-foreground"
          >
            {showDone ? "Hide" : "Show"} resolved · {done.length}
          </button>
          {showDone && (
            <div className="mt-3 space-y-2">
              {done.map((f) => (
                <FeedbackCard key={f.id} f={f} resolved onToggle={toggle} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({
  f,
  resolved,
  onToggle,
}: {
  f: AdminFeedback;
  resolved: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border border-border-default bg-bg-surface p-4 transition-opacity ${
        resolved ? "opacity-55" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(f.id, !resolved)}
        aria-pressed={resolved}
        aria-label={resolved ? "Mark as open" : "Mark as resolved"}
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
          resolved
            ? "border-accent-amber bg-accent-amber text-bg-base"
            : "border-border-strong text-transparent hover:border-accent-amber"
        }`}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`whitespace-pre-wrap text-sm text-foreground ${
            resolved ? "line-through decoration-text-subtle" : ""
          }`}
        >
          {f.message}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-subtle">
          <span className="min-w-0 truncate">
            {f.email ?? "unknown"}
            {f.path ? <span className="text-text-muted"> · {f.path}</span> : null}
          </span>
          <span className="shrink-0 tabular-nums">{fmtDate(f.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
