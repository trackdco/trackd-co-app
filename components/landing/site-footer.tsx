import Image from "next/image";
import Link from "next/link";

import { InstagramLogo, TiktokLogo } from "@/components/icons";
import { ACN, BUSINESS_NAME, CANONICAL_HOST, LEGAL_ENTITY, PRODUCT_NAME, SOCIAL_LINKS, SUPPORT_EMAIL } from "@/lib/brand";

import { LOGIN_HREF, START_HREF } from "./cta";
import { CALCULATOR_HREF } from "./site-header";

/**
 * The four statutory links. Lives beside the footer that renders it, and is
 * rendered on every public page.
 *
 * ⚠️ THE FULL NAME, VERBATIM. Washington's MHMDA requires the consumer health
 * data policy published under exactly this name and reachable without logging
 * in, and `lib/legal/verbatimQuotes.test.ts` pins the route and the label
 * against the front page (`app/page.tsx`, which passes this list in). A tidy-up
 * to "Health data" reads better and fails the statute.
 */
export interface LegalLink {
  href: string;
  label: string;
}

/**
 * THE FOOTER, REBUILT AS A DIVIDED BAND (spec 3-03 §3.10).
 *
 * - **Left:** the entity line, the support address and the 18+ line. These are
 *   partly for Apple's review of the domain (enrolment 9TNKRWYDUU): the entity
 *   has to be visibly associated with the site.
 * - **Centre, at the very bottom:** TikTok and Instagram.
 * - **Right:** quick links, which fill in as things get built. The free
 *   calculator is the first.
 * - **Across the bottom:** the four legal links.
 *
 * On a phone the columns stack, and the social icons still come last, centred.
 */
export function SiteFooter({ legal }: { legal: readonly LegalLink[] }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t-[0.5px] border-border-default pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="lp-wide grid gap-10 pt-12 md:grid-cols-3 md:gap-0 md:pt-14">
        <div className="md:pr-8">
          <Image src="/trackd-wordmark.png" alt={BUSINESS_NAME} width={1044} height={200} className="h-4 w-auto" />
          <p className="mt-5 max-w-[20rem] text-xs leading-relaxed text-text-secondary">
            {CANONICAL_HOST} is operated by {LEGAL_ENTITY},{" "}
            <span className="whitespace-nowrap">ACN {ACN}</span>.
          </p>
          <p className="mt-2 text-xs">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="rounded-sm text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-2 max-w-[20rem] text-xs leading-relaxed text-text-secondary">
            For people 18 and over. {PRODUCT_NAME} is a tracking tool and strictly does not give
            medical advice.
          </p>
        </div>

        {/* Centre: the social icons, pinned to the bottom of the band. Last
            on a phone. */}
        <div className="order-last flex flex-col items-center justify-end md:order-none md:border-x-[0.5px] md:border-border-default md:px-8">
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">
            Check out our socials
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Social href={SOCIAL_LINKS.tiktok} label={`${BUSINESS_NAME} on TikTok`}>
              <TiktokLogo className="h-5 w-5" />
            </Social>
            <Social href={SOCIAL_LINKS.instagram} label={`${BUSINESS_NAME} on Instagram`}>
              <InstagramLogo className="h-5 w-5" />
            </Social>
          </div>
        </div>

        <nav aria-label="Quick links" className="md:pl-8 md:text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Quick links</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <FooterLink href={CALCULATOR_HREF}>Reconstitution calculator</FooterLink>
            </li>
            <li>
              <FooterLink href={START_HREF}>Start your free trial</FooterLink>
            </li>
            <li>
              <FooterLink href={LOGIN_HREF}>Log in</FooterLink>
            </li>
          </ul>
        </nav>
      </div>

      <div className="lp-wide mt-10 md:mt-12">
        <div className="flex flex-col gap-4 border-t-[0.5px] border-border-default pt-6 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="rounded-sm text-xs text-text-secondary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-xs text-text-secondary">
            © {year} {LEGAL_ENTITY}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm text-foreground transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="lp-float flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {children}
    </a>
  );
}
