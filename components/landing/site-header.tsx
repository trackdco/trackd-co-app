"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { BUSINESS_NAME } from "@/lib/brand";
import { ArrivalNotice } from "@/components/landing/ArrivalNotice";
import { cn } from "@/lib/utils";

import { LOGIN_HREF } from "./cta";

/** The free calculator's public route. Linked from the menu and the footer. */
export const CALCULATOR_HREF = "/reconstitution-calculator";

/**
 * The sections the menu jumps to. Ids match the `<section>`s in `app/page.tsx`;
 * a section renamed there without this list following is a dead menu item,
 * which `landingSections.test.ts` catches.
 */
export const MENU_SECTIONS = [
  { id: "features", label: "Features" },
  { id: "movement", label: "Reviews" },
  { id: "compare", label: "Us vs them" },
  { id: "founders", label: "A letter from the founders" },
  { id: "questions", label: "Q&A" },
] as const;

/**
 * THE HEADER, WHICH IS PART OF THE HERO (spec 3-03 §3.1; Adrian, 2026-09-17).
 *
 * Not its own band: no background, no divider, not sticky. It sits on the
 * hero's lit ground and scrolls away with it. The docked call to action takes
 * over once it has gone.
 *
 * ## The menu is a DROP-DOWN, not a drawer, and it differs by device
 *
 * - **Phone:** a full-width panel under the header, and the page dims behind
 *   it. Tapping the dim closes it.
 * - **Laptop:** a narrow panel on the right under the button, and nothing
 *   dims. A click anywhere else closes it.
 *
 * Items drop in with a stagger. Escape closes it and hands focus back to the
 * button; scrolling closes it, because the panel scrolls with the header and a
 * menu drifting off the top of the screen helps nobody.
 *
 * ## ⚠️ A DISCLOSURE, NOT `role="menu"`
 *
 * An ARIA menu promises arrow-key navigation and a roving tab stop, and a menu
 * that claims the role without the behaviour is worse than a plain list. These
 * are ordinary links behind a button with `aria-expanded`, which is exactly
 * what they are, so Tab walks them with no extra code.
 *
 * `onHome` decides whether a section link is `#id` (smooth scroll on this
 * page) or `/#id` (navigate home first, from the calculator page).
 */
export function SiteHeader({
  onHome = true,
  hide = [],
}: {
  onHome?: boolean;
  /** Section ids that are not on the page (the reviews, while they are
   *  placeholders on production), so the menu does not offer a dead jump. */
  hide?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    // Focus the first item once it has mounted.
    const first = panelRef.current?.querySelector<HTMLElement>("a");
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(false);
    };
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 48) close(false);
    };
    // Tab walking out of the panel closes it, so a keyboard user never leaves
    // an open menu behind them.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(false);
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, close]);

  /** On the home page: a smooth scroll that respects reduced motion, and focus
   *  moved to the section so a keyboard or screen-reader user lands there too. */
  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (!onHome) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    setOpen(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
  };

  const sections = MENU_SECTIONS.filter((s) => !hide.includes(s.id));
  /** The drop-in stagger: one step per item, top to bottom. */
  const stagger = (i: number) => `${75 + i * 35}ms`;

  return (
    <header className="relative z-50">
      <div className="lp-wide flex h-16 items-center justify-between md:h-20">
        <Link
          href="/"
          aria-label={`${BUSINESS_NAME} home`}
          className="-mx-1 rounded-md px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/trackd-wordmark.png"
            alt={BUSINESS_NAME}
            width={1049}
            height={200}
            priority
            className="h-[1.05rem] w-auto md:h-[1.15rem]"
          />
        </Link>

        <ArrivalNotice />

        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
          className="lp-burger -mr-2 flex h-11 w-11 flex-col items-center justify-center gap-[4.5px] rounded-full transition-colors hover:bg-text-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span className="block h-[1.5px] w-[18px] rounded-full bg-foreground" />
          <span className="block h-[1.5px] w-[18px] rounded-full bg-foreground" />
          <span className="block h-[1.5px] w-[18px] rounded-full bg-foreground" />
        </button>
      </div>

      {open ? (
        <>
          {/* The dim, phone only. Below the header in z-order, so the button
              that closes the menu stays lit and tappable. */}
          <div
            aria-hidden
            onClick={() => close(false)}
            className="lp-scrim fixed inset-0 -z-10 bg-overlay-backdrop lg:hidden"
          />

          <div className="lp-wide pointer-events-none absolute inset-x-0 top-full">
            <div
              ref={panelRef}
              id={panelId}
              className="lp-menu-panel lp-float pointer-events-auto ml-auto w-full rounded-3xl p-2 lg:w-[19rem]"
            >
              <nav aria-label="Site">
                <ul>
                  {sections.map((s, i) => (
                    <li key={s.id} className="lp-menu-item" style={{ animationDelay: stagger(i) }}>
                      <a
                        href={onHome ? `#${s.id}` : `/#${s.id}`}
                        onClick={(e) => jump(e, s.id)}
                        className={ITEM}
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>

                <div className="mx-4 my-2 h-px bg-text-primary/8" aria-hidden />

                <ul>
                  <li className="lp-menu-item" style={{ animationDelay: stagger(sections.length) }}>
                    <Link
                      href={CALCULATOR_HREF}
                      onClick={() => setOpen(false)}
                      className={cn(ITEM, "justify-between")}
                    >
                      Reconstitution calculator
                      <span className="rounded-full bg-text-primary/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-text-secondary">
                        Free
                      </span>
                    </Link>
                  </li>
                  <li className="lp-menu-item" style={{ animationDelay: stagger(sections.length + 1) }}>
                    <Link
                      href={LOGIN_HREF}
                      onClick={() => setOpen(false)}
                      className={ITEM}
                    >
                      Log in
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

const ITEM =
  "flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[0.95rem] text-foreground transition-colors hover:bg-text-primary/6 focus-visible:bg-text-primary/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none";
