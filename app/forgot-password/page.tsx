import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password — Trackd Co",
};

/**
 * Step 1 of password reset: enter your email to receive a reset link. The link
 * (type=recovery) lands on /auth/confirm, which forwards to /reset-password.
 */
export default function ForgotPasswordPage() {
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
        Reset your password
      </h1>
      <p className="mt-3 max-w-[19rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
        Enter your email and we&apos;ll send you a link to set a new one.
      </p>

      <div className="mt-10 w-full max-w-[20rem]">
        <ForgotPasswordForm />
      </div>

      <Link
        href="/login"
        className="mt-12 text-sm text-text-muted transition-colors hover:text-foreground"
      >
        Back to sign in
      </Link>
    </div>
  );
}
