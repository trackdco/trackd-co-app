import Image from "next/image";
import { redirect } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { QuickActionsFab } from "@/components/shortcuts/QuickActionsFab";
import { ReadOnlyProvider } from "@/components/billing/ReadOnlyGate";
import { SignedImageRecovery } from "@/components/media/SignedImageRecovery";
import { SignOutConfirm } from "@/components/auth/sign-out-confirm";
import { SyncStatusNotice } from "@/components/notifications/SyncStatusNotice";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { RotationNotice } from "@/components/layout/RotationNotice";
import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";
import { DesktopRail } from "@/components/desktop/DesktopRail";
import { DesktopKeyboard } from "@/components/desktop/DesktopKeyboard";
import { getSessionContext } from "@/lib/auth";
import {
  gateWithDestination,
  loginWithDestination,
} from "@/lib/auth/destination";
import { canWriteData } from "@/lib/billing/gate";
import { createClient } from "@/lib/supabase/server";
import { unitForPreference } from "@/lib/weight";
import { bodySexFor } from "@/lib/db/types";

/**
 * Logged-in app shell. The authoritative gate every feature screen sits behind:
 *  - no session            -> /login
 *  - signed in, no gate yet -> /welcome (18+/ToS)
 * Only a fully signed-in, gated user reaches the children. getUser() (inside
 * getSessionContext) revalidates against the Auth server — the proxy refresh is
 * optimistic only and is never trusted for access.
 *
 * ## ⚠️ IT DOES NOT REDIRECT A LAPSED SUBSCRIBER, AND MUST NOT
 *
 * The obvious one-line version of the read-only gate is a third redirect here,
 * beside the two above. It would be wrong: a lapsed account keeps full READ
 * access to everything it has ever logged, and bouncing somebody off
 * `/dashboard` because their card expired would be withholding their own health
 * data to apply commercial pressure.
 *
 * So the gate is a PROVIDER, not a redirect. Every screen still renders. What
 * `canWriteData` decides is whether the write entry points inside them run or
 * open the pop-up. See `lib/billing/gate.ts` and
 * `components/billing/ReadOnlyGate.tsx`.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, passedGate } = await getSessionContext();
  if (!user) redirect(await loginWithDestination());
  if (!passedGate) redirect(await gateWithDestination());

  // The user's weight unit — for the FAB menu's quick log-weight popup — and the
  // body their injection-site map draws (the menu's log-dose flow shows one).
  // RLS scopes the read to this user; defaults to kg / the male body when unset.
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("units_preference, sex")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    // Non-fatal: fall back to the defaults, but surface the failure.
    console.error("[app/layout] profile fetch failed:", profileError.message);
  }
  const unit = unitForPreference(profile?.units_preference);
  const bodySex = bodySexFor(profile?.sex);

  /**
   * ⚠️ NO PRICE FETCH HERE ANY MORE (D28).
   *
   * The read-only pop-up used to embed a live plan selector, so this layout
   * fetched Stripe's prices for anybody who was locked out. D28 removed the
   * selector — the pop-up is a plain notice with a button to the price list — so
   * the fetch has nothing to feed and Stripe is no longer on the path of a
   * logged-in page load at all.
   */
  const canWrite = await canWriteData();

  return (
    <ReadOnlyProvider canWrite={canWrite}>
    {/*
      THE SHELL. One DOM, two placements.

      Phone: a flex column, header then main, with the fixed nav and FAB over
      the top. Exactly what it has always been; nothing in `desktop.css` matches.

      Laptop (>=1024px AND a pointer): a three-column grid, sidebar / main /
      rail. The header, the bottom nav and the FAB collapse and the two new
      columns appear. All of that is CSS applied on the FIRST paint with no
      JavaScript in the path, which is why there is no hydration flash and no
      second render tree to keep in step. See `app/desktop.css`.
    */}
    <div data-desktop-shell className="flex min-h-dvh flex-col">
      {/* Desktop only. `hidden` is its phone state and the desktop stylesheet
          gives it `display: flex`, so on a phone it draws nothing and announces
          nothing: there is never a second nav in the accessibility tree. */}
      <DesktopSidebar userId={user.id} />

      <header
        data-app-header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          priority
          className="h-4 w-auto"
        />
        <SignOutConfirm variant="link" />
      </header>

      {/* Bottom padding clears the fixed nav (height + safe-area inset). */}
      {/* Bottom padding clears the nav AND the FAB above it. Nav is 4rem; the
          FAB sits 1rem above that and is 3.5rem tall. Without the extra 4.5rem
          the last thing on a page rests UNDER the FAB at max scroll, which is
          not cosmetic: it made the Consistency widget's "All" button untappable
          on Progress — a real tap opened the quick-actions menu instead. */}
      <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
        {children}
      </main>

      {/* The rail: today's actionable state, and the column every bottom sheet
          docks into on desktop (`data-desktop="rail"`). Desktop only. */}
      <DesktopRail userId={user.id} unit={unit} bodySex={bodySex} />

      <BottomNav />
      <QuickActionsFab userId={user.id} unit={unit} bodySex={bodySex} />
      {/* Keyboard shortcuts. Listener-only, renders nothing, and every handler
          returns early unless the desktop query matches. */}
      <DesktopKeyboard />
      <SyncStatusNotice />
      {/* Re-signs a storage image whose five-minute URL expired while the tab
          sat open. Error-driven, never scheduled — see the component. */}
      <SignedImageRecovery />
      <ServiceWorkerRegistrar />
      {/* Portrait fallback for the browser case the manifest cannot reach. Waits
          for a SUSTAINED landscape and can be dismissed — see the component. */}
      <RotationNotice />
    </div>
    </ReadOnlyProvider>
  );
}
