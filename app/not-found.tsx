import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * App-wide 404. Renders inside the root layout (so it stays inside the
 * phone-only gate), branded to match /login and the legal pages.
 */
export default function NotFound() {
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
        Page not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        We couldn&apos;t find that page. It may have moved, or the link might be
        wrong.
      </p>
      <Button asChild size="lg" className="mt-8 h-12 w-full max-w-[16rem] rounded-xl">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
