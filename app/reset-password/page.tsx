import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Set a new password — Trackd Co",
};

/**
 * Step 3 of password reset: the landing page for a recovery link. /auth/confirm
 * has already verified the token and established a recovery session, so a valid
 * arrival has a user. If the link expired (no session), we point them back to
 * request a fresh one rather than showing a form that can't save.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Link href="/" aria-label="trackd co">
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          priority
          className="h-4 w-auto"
        />
      </Link>

      <h1 className="mt-12 text-balance text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground">
        Set a new password
      </h1>

      {user ? (
        <>
          <p className="mt-3 max-w-[19rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
            Choose a new password for your account.
          </p>
          <div className="mt-10 w-full max-w-[20rem]">
            <ResetPasswordForm />
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[19rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
            This reset link has expired or already been used. Request a new one
            to continue.
          </p>
          <div className="mt-10 w-full max-w-[20rem]">
            <Link
              href="/forgot-password"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 text-[0.95rem] font-medium text-bg-base transition-transform duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base active:scale-[0.98] motion-reduce:active:scale-100"
            >
              Request a new link
            </Link>
          </div>
        </>
      )}

      <Link
        href="/login"
        className="mt-12 text-sm text-text-muted transition-colors hover:text-foreground"
      >
        Back to sign in
      </Link>
    </div>
  );
}
