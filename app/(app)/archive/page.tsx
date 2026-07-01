import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ArchiveManager } from "@/components/home/ArchiveManager";
import { PAGE_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Archive — Trackd Co" };

/**
 * Archive — its own page now (Context/Feature Specs/08 → B1), reached from the
 * Profile App card alongside Settings + the legal docs. Lists the user's
 * compounds split into Archived and Active, with one tap to move either way
 * (Archive stops dosing but keeps history; Reactivate puts it back). Permanent
 * delete lives here and only here — an archived compound can be erased outright
 * (it + all its logged history), behind a two-step confirm. The (app) layout
 * already enforced auth + the gate.
 */
export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      <Link
        href="/profile"
        className="-ml-1 inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Profile
      </Link>

      <h1 className={`mt-3 ${PAGE_TITLE}`}>Archive</h1>
      <p className="mt-1.5 text-sm text-text-muted">
        Stop logging a compound to move it here, then reactivate to put it back —
        your past entries are kept. Or delete an archived compound to erase it and
        its history for good.
      </p>

      <div className="mt-6">
        <ArchiveManager userId={user!.id} />
      </div>
    </div>
  );
}
