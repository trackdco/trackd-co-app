"use client";

import { useEffect, useState } from "react";

import { LoginLine, StartButton, TRIAL_LINE } from "./cta";

/**
 * THE DOCKED CALL TO ACTION (spec 3-03 §3.11).
 *
 * Adrian kept the button that slides up and parks at the bottom, and asked for
 * it to be "its own kind of separate widget" (2026-09-17): a floating card
 * clear of the screen's edges rather than a bar welded to them, carrying the
 * same "Already a current user? Log in" line as the hero.
 *
 * ## When it shows
 *
 * Once the hero has scrolled away, and NOT while another call to action is on
 * screen: the Kyle section and the closing section each carry the same
 * button, and two of it in view at once is a page shouting. Every button marks
 * itself with `data-cta`, and so do the two sections built around one; the
 * dock watches them all.
 *
 * ## ⚠️ HIDDEN MEANS UNREACHABLE, NOT JUST INVISIBLE
 *
 * A translated-away widget still takes focus and is still read out, so the
 * first Tab on a fresh page would land on a control nobody can see. `inert`
 * removes it from both, and it comes back when the widget does.
 *
 * On a short phone (an iPhone SE in Safari is 548px tall) the trial line is
 * dropped from the dock: every in-page button still carries it, and the dock
 * would otherwise take a fifth of the screen.
 */
export function Dock({ heroId = "hero" }: { heroId?: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(heroId);
    if (!hero) return;
    const ctas = Array.from(document.querySelectorAll<HTMLElement>("[data-cta]")).filter(
      (el) => !el.closest("[data-dock]"),
    );

    let pastHero = false;
    const visible = new Set<Element>();
    const update = () => setShown(pastHero && visible.size === 0);

    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        // `top < 0` separates "scrolled past" from "not reached yet", which
        // matters when a browser restores a deep scroll position on reload.
        pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        update();
      },
      { threshold: 0 },
    );
    const ctaObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        update();
      },
      { threshold: 0 },
    );

    heroObserver.observe(hero);
    ctas.forEach((el) => ctaObserver.observe(el));
    return () => {
      heroObserver.disconnect();
      ctaObserver.disconnect();
    };
  }, [heroId]);

  return (
    <div
      data-dock
      inert={!shown}
      data-shown={shown ? "" : undefined}
      className="lp-dock px-3 py-3 md:px-4"
    >
      <div className="flex flex-col items-stretch gap-2.5 md:flex-row md:items-center md:gap-5">
        <div className="hidden min-w-0 flex-1 md:block md:pl-2">
          <p className="text-sm text-foreground">{TRIAL_LINE}</p>
          <LoginLine className="mt-0.5" />
        </div>
        <StartButton className="h-12 w-full md:w-auto md:shrink-0" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 md:hidden">
          <p className="text-[11px] text-text-secondary [@media(max-height:600px)]:hidden">{TRIAL_LINE}</p>
          <LoginLine className="text-[11px]" />
        </div>
      </div>
    </div>
  );
}
