// The only accounts allowed to see internal/admin surfaces (the /admin waitlist
// dashboard). Gated in BOTH places, defence-in-depth:
//   1. the page (redirects non-founders before anything renders), and
//   2. the waitlist RLS SELECT policy (supabase/waitlist/002_founder_read.sql).
// KEEP THIS LIST IN SYNC with that SQL policy's email list.
export const FOUNDER_EMAILS = [
  "admin@trackdco.app",
  "adrianschimizzi1@gmail.com",
] as const;

export function isFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  return (FOUNDER_EMAILS as readonly string[]).includes(email.toLowerCase());
}
