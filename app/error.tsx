"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * App-wide error boundary. Catches render/runtime errors anywhere below the
 * root layout and shows a branded recover screen instead of Next's default
 * error page.
 *
 * ## ⚠️ `unstable_retry`, NOT `reset` — the button was doing nothing
 *
 * Next 16's `reset()` clears the error state and re-renders the boundary's
 * children WITHOUT re-fetching them (`node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/error.md`: "use `unstable_retry()`
 * instead ... unless you have a specific reason to ... re-render the error
 * boundary's children without re-fetching the contents").
 *
 * Almost everything this boundary catches is thrown in a SERVER component, so
 * `reset()` re-ran a client render against the same failed payload and produced
 * the same error. The primary button on the app's error screen was a no-op for
 * the errors it was most likely to be shown for — which is how somebody lands on
 * the secondary link instead. `unstable_retry()` re-fetches the segment.
 *
 * ## The paid flow does NOT use this screen
 *
 * `/plans`, `/checkout` and `/onboarding` have their own boundary, because
 * "Back to home" below is a door into the app and an error mid-payment must not
 * open one. See `components/billing/FlowError.tsx`. The link stays here: for an
 * error on a screen the user already had access to, it is the right offer.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
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
        onClick={() => unstable_retry()}
        className="mt-8 h-12 w-full max-w-[16rem] rounded-xl"
      >
        Try again
      </Button>
      <Link
        href="/"
        className="mt-4 text-sm text-text-muted transition-colors hover:text-foreground"
      >
        Back to home
      </Link>
    </div>
  );
}
