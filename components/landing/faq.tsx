"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export interface Faq {
  q: string;
  /** One paragraph, or several. */
  a: string | readonly string[];
}

/**
 * "STILL HAVE QUESTIONS?" (spec 3-03 §3.8).
 *
 * The vial is the point of this section. Each question has a small one beside
 * it, full; opening the question lifts the cap and DRAINS the vial as the
 * answer slides down, as though the question is being emptied out. Closing
 * refills it and the cap settles. The sequencing lives in `globals.css`
 * (`.lp-vial-*`): cap first then liquid on the way out, liquid first then cap
 * on the way back, which is what makes it read as a mechanism.
 *
 * A disclosure per question: a real button with `aria-expanded`, so Tab,
 * Enter and Space work with no extra code. Several can be open at once, which
 * is how a reader compares two answers.
 *
 * The liquid is amber, the page's third and last amber beat.
 */
export function FaqList({ items }: { items: readonly Faq[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((f) => (
        <FaqItem key={f.q} item={f} />
      ))}
    </ul>
  );
}

function FaqItem({ item }: { item: Faq }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="lp-panel rounded-3xl" data-open={open ? "" : undefined}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-4 rounded-3xl px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-6 md:py-5"
        >
          <Vial />
          <span className="min-w-0 flex-1 text-[0.98rem] leading-snug text-foreground md:text-[1.05rem]">
            {item.q}
          </span>
        </button>
      </h3>
      <div id={id} className="lp-expand" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div
            className={cn(
              "max-w-[36rem] space-y-3 pb-5 pl-[3.25rem] pr-5 text-sm leading-relaxed text-text-secondary md:pb-6 md:pl-[3.75rem] md:text-[0.95rem]",
            )}
          >
            {(typeof item.a === "string" ? [item.a] : item.a).map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * A small, simple vial: cap, neck, glass, liquid. Simpler than the app's own
 * `Vial` on purpose, because at 20px the app's detail turns to noise.
 *
 * The liquid is a rect scaled on Y from its base; the surface line travels
 * down with it by `--vial-drop` (the liquid's height in viewBox units, which
 * CSS transforms on SVG elements are measured in).
 */
function Vial() {
  const clip = `lp-vial-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      aria-hidden
      focusable="false"
      width="20"
      height="32"
      viewBox="0 0 20 32"
      className="lp-vial shrink-0 overflow-visible"
      style={{ "--vial-drop": "15.6px" } as React.CSSProperties}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="3.9" y="8.9" width="12.2" height="21.2" rx="2.4" />
        </clipPath>
      </defs>
      {/* Glass */}
      <rect x="3.2" y="8.2" width="13.6" height="22.6" rx="3" className="fill-bg-surface-raised stroke-border-strong" strokeWidth="1" />
      {/* Liquid and its surface, clipped to the inside of the glass. */}
      <g clipPath={`url(#${clip})`}>
        <rect x="3.9" y="14.5" width="12.2" height="15.6" className="lp-vial-liquid fill-accent-amber" />
        <rect
          x="3.9"
          y="14.1"
          width="12.2"
          height="1.1"
          className="lp-vial-surface"
          style={{ fill: "color-mix(in srgb, var(--accent-amber) 62%, var(--text-primary))" }}
        />
        <circle cx="8" cy="25" r="0.9" className="lp-vial-bubble fill-text-primary/70" />
        <circle cx="12.2" cy="22" r="0.7" className="lp-vial-bubble fill-text-primary/70" />
      </g>
      {/* A glint down the glass. */}
      <rect x="5.4" y="11" width="1.3" height="15" rx="0.65" className="fill-text-primary" opacity="0.08" />
      {/* Neck and cap. The cap lifts and turns as the question opens. */}
      <rect x="6.2" y="5.6" width="7.6" height="3" rx="0.6" className="fill-border-strong" />
      <rect x="5.2" y="1.2" width="9.6" height="4.8" rx="1.3" className="lp-vial-cap fill-text-secondary" />
    </svg>
  );
}
