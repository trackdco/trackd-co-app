import Link from "next/link";

import { HEALTH_CONSENT } from "@/lib/legal/consentCopy";

/**
 * THE HEALTH-DATA CONSENT SENTENCE, RENDERED. ONE SOURCE, TWO SURFACES.
 *
 * `/welcome` and onboarding both ask for this consent and must not ask for it in
 * different words. The words live in `lib/legal/consentCopy.ts` where a test can
 * reach them; this holds only the link and the styling, which legitimately differ
 * between a document gate and an onboarding step.
 *
 * ⚠️ IT HOLDS NO COPY. Every character comes from `HEALTH_CONSENT`. If you find
 * yourself typing a word into this file, the word belongs in the module instead —
 * that is exactly the state this component was created to end.
 */
export function HealthConsentText({ linkClassName }: { linkClassName: string }) {
  return (
    <>
      {HEALTH_CONSENT.before}
      <Link
        href={HEALTH_CONSENT.linkHref}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {HEALTH_CONSENT.linkLabel}
      </Link>
      {HEALTH_CONSENT.after}
    </>
  );
}
