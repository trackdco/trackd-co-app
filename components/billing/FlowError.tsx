"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * THE ERROR SCREEN FOR THE PAID FLOW, and the reason it is not the app-wide one.
 *
 * ## What went wrong with the app-wide one (Adrian, 2026-08-27)
 *
 * He hit an error partway through `/plans`, and the only two things the screen
 * offered were "Try again" and "Back to home". He clicked the second, `/` sent
 * him to `/dashboard` (`app/page.tsx` routes a signed-in, gated user straight
 * into the app), and he was inside Trackd having never reached a card field.
 *
 * ⚠️ **THAT DOOR IS NOT ALLOWED TO EXIST HERE.** An error thrown while somebody
 * is choosing a plan or entering a card is a reason to put them BACK IN THE
 * FLOW, never a reason to hand them the product. The app-wide `app/error.tsx`
 * keeps its "Back to home" — it is the right offer for an error on a screen the
 * user already had access to. It is the wrong offer for this one, and the fix is
 * a boundary of our own rather than weakening that screen for everywhere else.
 *
 * ## ⚠️ `unstable_retry`, NOT `reset`, AND THE DIFFERENCE IS THE WHOLE BUTTON
 *
 * Next 16's `reset()` clears the error state and re-renders the boundary's
 * children **without re-fetching** (`node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/error.md`). Every error this boundary
 * actually catches is thrown in a SERVER component — the Stripe price load, the
 * eligibility read, the date resolution — so `reset()` re-runs a client render
 * against the same failed payload and lands on the same error.
 *
 * That is what "Try again" did on the screen Adrian was looking at: nothing.
 * A dead primary button is why he reached for the secondary one, so the door and
 * the button are one defect, not two. `unstable_retry()` re-fetches the segment,
 * which is what somebody pressing "Try again" on a transient Stripe failure is
 * asking for and what makes the honest offer honest.
 *
 * ## The copy is `app/error.tsx`'s, verbatim
 *
 * Not reworded, and specifically not given a payment-flavoured variant. The
 * tempting sentence here is "nothing has been charged" — and this boundary
 * cannot know that. It catches a render failure, which can occur after a
 * confirm has already succeeded, so that reassurance would be a claim about
 * somebody's card made by code that never saw the charge. Standing rule 0: a
 * state that means "we could not tell" is not spent as one that means something
 * specific. The existing sentence is true on every branch, so it is reused
 * rather than replaced.
 */
export function FlowError({
  error,
  retry,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /**
   * Where the secondary exit goes — and it goes back INTO the flow or nowhere.
   * Omitted on `/plans`, which is already the start of the flow: a link from the
   * plan screen to the plan screen is not an escape hatch, it is a reload
   * wearing one, and offering it would only be there to look like a choice.
   */
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    // Surfaces in the browser console + Vercel logs; no user data is included.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Image
        src="/trackd-wordmark.png"
        alt="trackd co"
        width={1049}
        height={200}
        className="h-4 w-auto opacity-80"
      />
      <h1 className="mt-10 text-3xl font-light tracking-[-0.02em] text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        Something broke on our end. Your data is safe. Try again, and if it
        keeps happening, let us know.
      </p>
      <Button
        size="lg"
        onClick={() => retry()}
        className="mt-8 h-12 w-full max-w-[16rem] rounded-xl"
      >
        Try again
      </Button>
      {backHref ? (
        <Link
          href={backHref}
          className="mt-4 text-sm text-text-muted transition-colors hover:text-foreground"
        >
          {backLabel}
        </Link>
      ) : null}
    </div>
  );
}
