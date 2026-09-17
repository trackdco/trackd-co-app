import type { ReactNode } from "react";
import Image from "next/image";

import { Calculator, ChartLine, Plus, SquaresFour, Syringe, User } from "@/components/icons";
import { cn } from "@/lib/utils";

/** The app's five tabs, in the app's order (`components/navigation/bottom-nav.tsx`). */
const TABS = [
  { key: "dashboard", label: "Dashboard", Icon: SquaresFour },
  { key: "protocol", label: "Protocol", Icon: Syringe },
  { key: "calculator", label: "Calculator", Icon: Calculator },
  { key: "progress", label: "Progress", Icon: ChartLine },
  { key: "profile", label: "Profile", Icon: User },
] as const;

export type PhoneTab = (typeof TABS)[number]["key"];

/**
 * AN IPHONE WITH THE APP IN IT (spec 3-03 §3.4, the features widget).
 *
 * Replaces 3-02's placeholder device. (The hero's phone is Adrian's own
 * recording now: `hero-video.tsx`.) Two things make this one read as the real
 * app rather than a drawing of it:
 *
 * 1. **The screen is laid out at 390 x 844 and scaled as a whole** (see
 *    `.lp-phone-logical`). Every row, figure and icon inside is at the app's
 *    own size in proportion to the rest, so the app's own class names can be
 *    used unchanged.
 * 2. **The app's chrome is there**: the wordmark header, the five-tab bar with
 *    the right tab lit, and the white add button. The one thing left out is the
 *    header's "Sign out", which is nonsense on a page for people without an
 *    account.
 *
 * The band is the same three-stop recipe as `app-carousel.tsx` and
 * `device-frame.tsx`, so the phone on the website is the phone in the flow.
 *
 * DECORATIVE BY CONSTRUCTION: the whole device is one `role="img"` with a
 * description, so nothing inside is announced or focusable, and the screens
 * built for it must contain no links or buttons.
 */
export function Phone({
  children,
  label,
  tab,
  chrome = true,
  className,
}: {
  children: ReactNode;
  /** What the picture shows, for anyone not looking at it. */
  label: string;
  /** Which tab is lit. */
  tab: PhoneTab;
  /** The add button and the tab bar. Off when a sheet covers them, as a real
   *  bottom sheet does. */
  chrome?: boolean;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("lp-phone relative shrink-0", className)}
    >
      {/* Side buttons, on the outer edge behind the band. */}
      <span aria-hidden className="absolute -left-[2px] top-[16%] h-[3.4%] w-[2px] rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      <span aria-hidden className="absolute -left-[2px] top-[24%] h-[6.5%] w-[2px] rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      <span aria-hidden className="absolute -left-[2px] top-[32.5%] h-[6.5%] w-[2px] rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      <span aria-hidden className="absolute -right-[2px] top-[27%] h-[10%] w-[2px] rounded-r-sm bg-gradient-to-r from-border-strong to-bg-base" />

      <div
        className={cn(
          "relative rounded-[calc(var(--phone-w)*0.16)] p-[4px]",
          "bg-gradient-to-b from-border-strong via-bg-surface to-black",
          "shadow-[0_2px_6px_rgb(0_0_0/0.55),0_40px_80px_-30px_rgb(0_0_0/0.95)]",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[calc(var(--phone-w)*0.16)] ring-1 ring-inset ring-white/12"
        />
        <div className="lp-phone-screen relative overflow-hidden rounded-[calc(var(--phone-w)*0.145)] bg-bg-base ring-1 ring-inset ring-black/70">
          {/* `inert`: nothing inside a picture is focusable or announced, which is
              what lets a screen reuse the app's real (interactive) components. */}
          <div inert className="lp-phone-logical relative overflow-hidden bg-bg-base text-left">
            <StatusBar />
            <AppHeader />
            <div className="relative">{children}</div>
            {chrome ? (
              <>
                <span className="absolute bottom-[112px] right-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-bg-base shadow-lg">
                  <Plus className="h-6 w-6" />
                </span>
                <TabBar tab={tab} />
              </>
            ) : null}
            {/* The island and the home indicator, at Apple's proportions. */}
            <span className="absolute left-1/2 top-[11px] h-[37px] w-[125px] -translate-x-1/2 rounded-full bg-black" />
            <span className="absolute bottom-[8px] left-1/2 h-[5px] w-[140px] -translate-x-1/2 rounded-full bg-text-primary/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex h-[54px] items-center justify-between px-[34px] pt-[6px] text-[17px] font-medium text-foreground">
      <span className="font-sans tabular-nums tracking-[-0.01em]">9:41</span>
      <span className="flex items-center gap-[6px]">
        {/* Signal */}
        <svg width="19" height="12" viewBox="0 0 19 12" className="fill-foreground">
          <rect x="0" y="8" width="3.2" height="4" rx="0.8" />
          <rect x="5.2" y="5.5" width="3.2" height="6.5" rx="0.8" />
          <rect x="10.4" y="3" width="3.2" height="9" rx="0.8" />
          <rect x="15.6" y="0" width="3.2" height="12" rx="0.8" />
        </svg>
        {/* Wi-Fi */}
        <svg width="17" height="12" viewBox="0 0 17 12" className="fill-foreground">
          <path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.3-1.3A10.6 10.6 0 0 0 8.5.4 10.6 10.6 0 0 0 .9 3.5l1.3 1.3a8.8 8.8 0 0 1 6.3-2.5z" />
          <path d="M8.5 6c1.4 0 2.7.5 3.7 1.4l1.3-1.3A7 7 0 0 0 8.5 4.1a7 7 0 0 0-5 2l1.3 1.3A5.3 5.3 0 0 1 8.5 6z" />
          <path d="M8.5 9.7c.6 0 1 .2 1.4.5L8.5 11.7 7.1 10.2c.4-.3.8-.5 1.4-.5z" />
        </svg>
        {/* Battery */}
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="22" height="12" rx="3.6" fill="none" className="stroke-foreground/40" />
          <rect x="2" y="2" width="16" height="9" rx="2.2" className="fill-foreground" />
          <path d="M24.5 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" className="fill-foreground/45" />
        </svg>
      </span>
    </div>
  );
}

function AppHeader() {
  return (
    <div className="flex h-[40px] items-center border-b border-border/60 px-5 pb-3">
      <Image
        src="/trackd-wordmark.png"
        alt=""
        width={1049}
        height={200}
        className="h-4 w-auto"
      />
    </div>
  );
}

function TabBar({ tab }: { tab: PhoneTab }) {
  return (
    <div className="absolute inset-x-0 bottom-0 border-t-[0.5px] border-border-default bg-bg-base/90 pb-[34px] backdrop-blur">
      <div className="grid h-16 grid-cols-5 items-center px-2">
        {TABS.map(({ key, label, Icon }) => (
          <span
            key={key}
            className={cn(
              "flex flex-col items-center justify-center gap-1 py-1",
              key === tab ? "text-foreground" : "text-text-subtle",
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
