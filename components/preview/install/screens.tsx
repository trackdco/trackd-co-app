"use client";

import Image from "next/image";
import { useState } from "react";

import { FLOW_SUB, FLOW_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { HomeScreenMock, IosStatusBar, SafariArt, type Skin } from "./mocks";

import "./install-mocks.css";

/**
 * The install screens, at real device size.
 *
 * These are the surfaces Trackd itself owns — the pre-sell, the black stop
 * screen, and the three "you came back to the browser" states. They render
 * full-bleed so `/preview/install/*` can be opened on an actual handset and
 * judged at the size it will ship at, which a scaled mock cannot show you.
 */

/* ---------------------------------------------------------------- shell */

function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("im-screen", className)}>
      <IosStatusBar />
      {children}
      <span className="im-homebar" style={{ background: "#3A3A38" }} />
    </div>
  );
}

/** The onboarding header: back arrow and the progress rail, as `flow.tsx` draws it. */
function FlowHead({ pct }: { pct: number }) {
  return (
    <div className="grid flex-none grid-cols-[28px_1fr] items-center gap-2 px-5 pt-0.5">
      <span className="flex text-text-muted">
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" aria-hidden>
          <path d="m14.5 5-6 7 6 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex items-center justify-end gap-2.5">
        <span className="h-[6px] w-36 overflow-hidden rounded-full bg-bg-surface-raised">
          <span className="block h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
        </span>
        <span className="font-mono text-[11px] tabular-nums text-text-muted">{pct}%</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- pre-sell */

/**
 * "This is where Trackd goes".
 *
 * ONE ACTION, deliberately (Adrian, this round). Installing is how
 * notifications work at all on iOS, so there is no "I understand" and no
 * skip here — the single small escape hatch lives on the walkthrough that
 * follows. The slam-in is the only motion on the screen.
 */
export function PresellScreen({ skin }: { skin: Skin }) {
  const how =
    skin === "ios"
      ? "It gets there from Safari — its own icon, no address bar, and reminders that actually arrive. Four taps, and we'll show you each one."
      : `${skin === "sam" ? "Samsung Internet" : "Chrome"} can put it there for you — its own icon, no address bar, and reminders that actually arrive.`;

  return (
    <Screen>
      <FlowHead pct={88} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5">
        <h1 className={cn(FLOW_TITLE, "text-center text-[1.66rem] text-balance")}>
          This is where Trackd goes
        </h1>
        <div className="h-[18px] flex-none" />
        <div className="relative h-[352px] flex-none overflow-hidden rounded-[26px] border border-border-default">
          <HomeScreenMock skin={skin} landing />
        </div>
        <div className="h-[18px] flex-none" />
        <p className={cn(FLOW_SUB, "mx-auto max-w-[20.5rem] text-center text-pretty")}>{how}</p>
      </div>
      <div className="flex flex-none flex-col gap-2 px-5 pt-4 pb-[26px]">
        <button
          type="button"
          className="flex h-13 w-full items-center justify-center rounded-2xl bg-accent-primary px-6 text-[0.95rem] font-medium text-bg-base transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
        >
          Add to home screen
        </button>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------ stop screen */

/**
 * Chrome on iPhone cannot add to the Home Screen, and saying so in a sentence
 * under a normal page is the kind of thing people scroll past. The product
 * stops instead: the page goes black and the only thing on it is where to go.
 */
export function OpenSafariScreen() {
  return (
    <Screen>
      <div className="im-stop">
        <span className="im-stop-icon">
          <span className="im-stop-ring" />
          <span className="im-stop-tile">
            <SafariArt />
          </span>
        </span>
        <h2 className="mt-[26px] text-[2.15rem] leading-[1.02] font-light tracking-[-0.035em] text-white">
          Open Safari
        </h2>
        <p className="mt-3 max-w-[17.5rem] text-[0.98rem] leading-[1.55] text-[rgb(240_239_233/0.66)] text-pretty">
          Chrome can&rsquo;t put apps on your iPhone&rsquo;s Home&nbsp;Screen. Only Safari can.
        </p>
        <span className="mt-[26px] inline-flex items-center gap-2.5 rounded-full border border-[rgb(240_239_233/0.16)] bg-[rgb(240_239_233/0.05)] py-2.5 pr-2 pl-4 font-mono text-[12.5px] text-[#F0EFE9]">
          trackd.co
          <em className="rounded-full bg-accent-amber px-2.5 py-1 text-[9.5px] tracking-[0.14em] text-[#100E09] uppercase not-italic">
            Copied
          </em>
        </span>
        <p className="mt-[18px] text-[0.8rem] text-[rgb(240_239_233/0.34)]">
          Paste it into Safari&rsquo;s address bar and carry on.
        </p>
      </div>
    </Screen>
  );
}

/* --------------------------------------------------- returned to browser */

function TrackdIcon({ tick, asking }: { tick?: boolean; asking?: boolean }) {
  return (
    <span className="im-icon-wrap">
      <span className={cn("im-icon", asking ? "asking" : "settled")}>
        <Image src="/icon-192.png" alt="" width={192} height={192} />
      </span>
      {tick ? (
        <span className="im-tick">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
            <path d="m5 12.4 4.7 4.6L19 7.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </span>
  );
}

export type ReturnedCase = "android" | "ask" | "obsolete";

/**
 * The screen the browser tab should show once the app is on the home screen.
 *
 * The three cases differ by HOW SURE WE ARE. Android can know — `appinstalled`
 * is a real event. iOS cannot know at all, so it asks rather than claims:
 * telling somebody they installed it when they did not sends them hunting for
 * an icon that is not there, and because we said they were done they never
 * come back to it.
 */
export function ReturnedScreen({ variant }: { variant: ReturnedCase }) {
  if (variant === "android") {
    return (
      <Screen>
        <div className="im-ret">
          <TrackdIcon tick />
          <h2 className={cn(FLOW_TITLE, "mt-7 text-[1.95rem] text-balance")}>
            Trackd is on your home screen
          </h2>
          <p className={cn(FLOW_SUB, "mt-3 max-w-[19rem] text-center text-pretty")}>
            You can close this tab. Open Trackd from your home screen &mdash; that&rsquo;s where
            your reminders come from.
          </p>
          <span className="mt-5 flex items-center gap-2 font-mono text-[9.5px] tracking-[0.16em] text-text-subtle uppercase">
            <i className="h-[5px] w-[5px] rounded-full bg-text-subtle" />
            This tab is finished
          </span>
        </div>
        <div className="flex flex-none flex-col gap-2 px-5 pt-4 pb-[26px]">
          <button
            type="button"
            className="flex h-13 w-full items-center justify-center rounded-2xl bg-accent-primary px-6 text-[0.95rem] font-medium text-bg-base"
          >
            Got it
          </button>
        </div>
      </Screen>
    );
  }

  if (variant === "ask") {
    return (
      <Screen>
        <div className="im-ret">
          <TrackdIcon asking />
          <h2 className={cn(FLOW_TITLE, "mt-7 text-[1.95rem] text-balance")}>Did you add Trackd?</h2>
          <p className={cn(FLOW_SUB, "mt-3 max-w-[19rem] text-center text-pretty")}>
            If it&rsquo;s on your Home Screen, open it from there &mdash; everything happens in the
            app now.
          </p>
        </div>
        <div className="flex flex-none flex-col gap-2 px-5 pt-4 pb-[26px]">
          <button
            type="button"
            className="flex h-13 w-full items-center justify-center rounded-2xl bg-accent-primary px-6 text-[0.95rem] font-medium text-bg-base"
          >
            Yes, it&rsquo;s on my Home Screen
          </button>
          <button type="button" className="mx-auto block rounded-md px-3 py-2 text-[11.5px] text-text-subtle">
            Not yet &mdash; show me the steps
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="im-ret">
        <TrackdIcon tick />
        <h2 className={cn(FLOW_TITLE, "mt-7 text-[1.95rem] text-balance")}>
          Open Trackd from your Home Screen
        </h2>
        <p className={cn(FLOW_SUB, "mt-3 max-w-[19rem] text-center text-pretty")}>
          Look for this icon. This Safari tab is finished &mdash; carrying on here won&rsquo;t carry
          over.
        </p>
        <span className="mt-5 flex max-w-[20rem] items-start gap-2.5 rounded-2xl border border-border-default bg-bg-surface px-3.5 py-3 text-left">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-[15px] w-[15px] flex-none text-accent-amber" fill="none" aria-hidden>
            <rect x="5" y="10.5" width="14" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8.4 10.5V7.6a3.6 3.6 0 0 1 7.2 0v2.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className="text-[0.82rem] leading-[1.5] text-text-muted">
            You&rsquo;ll <b className="font-normal text-foreground">sign in once more</b> in the app.
            iPhone keeps a Home Screen app separate from Safari, so it starts with a clean slate.
          </span>
        </span>
      </div>
      <div className="flex flex-none flex-col gap-2 px-5 pt-4 pb-[26px]">
        <button type="button" className="mx-auto block rounded-md px-3 py-2 text-[11.5px] text-text-subtle">
          I haven&rsquo;t added it yet
        </button>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------- switcher */

const SKINS: { id: Skin; label: string }[] = [
  { id: "ios", label: "iPhone" },
  { id: "sam", label: "Samsung" },
  { id: "pix", label: "Pixel" },
];

export function PresellWithSkins() {
  const [skin, setSkin] = useState<Skin>("ios");
  return (
    <>
      <div className="pointer-events-auto fixed inset-x-0 top-0 z-50 flex justify-center gap-1.5 p-2">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSkin(s.id)}
            aria-pressed={skin === s.id}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase",
              skin === s.id
                ? "border-accent-amber bg-accent-amber text-bg-base"
                : "border-border-default bg-bg-surface/80 text-text-muted backdrop-blur",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <PresellScreen skin={skin} />
    </>
  );
}

const CASES: { id: ReturnedCase; label: string }[] = [
  { id: "ask", label: "iPhone · ask" },
  { id: "obsolete", label: "iPhone · obsolete" },
  { id: "android", label: "Android · verified" },
];

export function ReturnedWithCases() {
  const [variant, setVariant] = useState<ReturnedCase>("ask");
  return (
    <>
      <div className="pointer-events-auto fixed inset-x-0 top-0 z-50 flex justify-center gap-1.5 p-2">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setVariant(c.id)}
            aria-pressed={variant === c.id}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase",
              variant === c.id
                ? "border-accent-amber bg-accent-amber text-bg-base"
                : "border-border-default bg-bg-surface/80 text-text-muted backdrop-blur",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ReturnedScreen variant={variant} />
    </>
  );
}
