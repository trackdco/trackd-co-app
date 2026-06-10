import Image from "next/image";
import { redirect } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { SignOutConfirm } from "@/components/auth/sign-out-confirm";
import { getSessionContext } from "@/lib/auth";

/**
 * Logged-in app shell. The authoritative gate every feature screen sits behind:
 *  - no session            -> /login
 *  - signed in, no gate yet -> /welcome (18+/ToS)
 * Only a fully signed-in, gated user reaches the children. getUser() (inside
 * getSessionContext) revalidates against the Auth server — the proxy refresh is
 * optimistic only and is never trusted for access.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, passedGate } = await getSessionContext();
  if (!user) redirect("/login");
  if (!passedGate) redirect("/welcome");

  return (
    <div className="flex min-h-dvh flex-col">
      <header
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
      <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <BottomNav userId={user.id} />
    </div>
  );
}
