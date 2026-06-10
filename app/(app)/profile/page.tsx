import type { Metadata } from "next";

import { ArchiveManager } from "@/components/home/ArchiveManager";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Profile — Trackd Co" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-md space-y-8 px-5 py-6">
      <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-foreground">
        My Profile
      </h1>

      <section>
        <h2 className="font-display text-xl font-medium text-foreground">
          Archive
        </h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Stop logging a compound to move it here; reactivate to put it back in
          your log. Your past entries are always kept.
        </p>
        <ArchiveManager userId={user?.id ?? "anon"} />
      </section>
    </div>
  );
}
