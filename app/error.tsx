"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * App-wide error boundary. Catches render/runtime errors anywhere below the
 * root layout and shows a branded recover screen instead of Next's default
 * error page. `reset()` re-renders the failed segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
      <h1 className="mt-10 font-display text-3xl tracking-[-0.02em] text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        Something broke on our end. Your data is safe — try again, and if it
        keeps happening, let us know.
      </p>
      <Button
        size="lg"
        onClick={() => reset()}
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
