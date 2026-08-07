import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * THE ONLY THING THAT MAY SET THE 18+/ToS GATE.
 *
 * `supabase/grants/004_gate_column_lock.sql` takes `is_18_plus`,
 * `tos_accepted_at`, `tos_version` and `date_of_birth` out of the
 * `authenticated` column grants on `profiles`, because a cold review reproduced
 * a signed-in user PATCHing themselves straight through the gate with nothing
 * but the publishable key — which opened the entire `(app)` group and the
 * payment path to an account whose recorded date of birth said eleven, with no
 * `consent_records` row behind it.
 *
 * `passedGate` is the SOLE authorization on three controls (the payment
 * endpoint, the paywall route guard, and the logged-in app shell), so a
 * self-writable flag made all three decorative.
 *
 * ## What did NOT change
 *
 * The age checks. `app/welcome/actions.ts` still refuses a date of birth under
 * 18 server-side, and `passGateFromSession` still re-decides the age from the
 * claimed session rather than trusting the client. This module changes only WHO
 * EXECUTES THE WRITE once one of those checks has passed: the user may no longer
 * set the flag that says they passed it.
 *
 * ## Why it is its own client
 *
 * `lib/billing/service.ts` is typed to the four billing tables and `profiles` is
 * not one of them. A shared untyped client would resolve every table to `never`
 * (see `lib/billing/schema.ts` for what that costs), so this is a small typed
 * client for exactly the columns it is allowed to touch — which also means it
 * cannot quietly grow into a general-purpose back door.
 */

type GateRow = {
  id: string;
  date_of_birth: string | null;
  sex: string | null;
  is_18_plus: boolean;
  tos_accepted_at: string | null;
  tos_version: string | null;
};

/** Type alias, not an interface — see `lib/billing/schema.ts` for why. */
type GateDatabase = {
  public: {
    Tables: {
      profiles: {
        Row: GateRow;
        Insert: Partial<GateRow> & { id: string };
        Update: Partial<GateRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

let client: ReturnType<typeof createClient<GateDatabase>> | null = null;

export function gateWriter() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required to write the 18+/ToS gate.",
    );
  }

  client = createClient<GateDatabase>(url, key, {
    // No session, no refresh, no storage. This client is not a user.
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
