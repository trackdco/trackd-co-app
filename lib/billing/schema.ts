/**
 * The billing tables, typed for the service-role client.
 *
 * ## Why this file exists at all
 *
 * `createClient()` with no schema generic resolves every table to `never`, so an
 * insert type-checks against nothing and a misspelled column is a runtime
 * surprise. The existing service-role client (`lib/db/admin/`) gets
 * away with it because it only ever counts rows; the webhook WRITES, and a
 * webhook that writes the wrong column name fails on a real payment.
 *
 * This is deliberately not the whole database. Generating the full type from the
 * live schema is the right long-term answer and is a bigger change than this
 * spec; these four tables are the ones being written here, so these four are
 * typed here. Keep them matching `supabase/billing/001_billing_tables.sql` —
 * the SQL is the source of truth and this is a hand-copy of it.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export type EntitlementSourceRow = "stripe" | "apple" | "google" | "comp";
export type EntitlementProductRow = "pro";

type BillingCustomerRow = {
  user_id: string;
  stripe_customer_id: string;
  /**
   * The lease `startTrial` holds across its Stripe check-and-create
   * (`supabase/billing/002`, `lib/billing/trialLease.ts`). `-infinity` when
   * unheld.
   *
   * ⚠️ Typed here while `002` may still be UNAPPLIED, which is a deliberate
   * asymmetry: the type says the column exists so the claim can be written
   * normally, and the claim handles the `42703` it gets back if it does not. A
   * type cannot know what a hand-applied migration has done.
   */
  trial_lock_until: string;
  created_at: string;
  updated_at: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /**
   * When a save-offer courtesy period ends, mirrored from the Stripe
   * subscription's metadata. Null for a genuine first trial.
   *
   * Distinguishes "Stripe says trialing because we gave a paying customer a free
   * month" from "Stripe says trialing because this person has never paid", which
   * the status alone cannot. See `supabase/billing/003_courtesy_until.sql`.
   */
  courtesy_until: string | null;
  created_at: string;
  updated_at: string;
};

type EntitlementRow = {
  id: string;
  user_id: string;
  product: EntitlementProductRow;
  source: EntitlementSourceRow;
  active_until: string | null;
  is_active: boolean;
  /**
   * WHY `is_active` was set false: `dispute` or `refund`. Null when the row was
   * never revoked — and also for every row revoked BEFORE `005` was applied.
   *
   * `entitlements` recorded THAT a row was revoked and never why, so a full
   * refund and a chargeback left byte-identical rows and both of `08`'s dispute
   * sentences selected for a refunded account. `revokeForCustomer` already knew:
   * it takes `reason` as a parameter and simply did not persist it.
   *
   * ⚠️ NULL IS "UNKNOWN", NEVER "dispute". The read path withholds both dispute
   * sentences on it, because the wrong default here IS the lie — it would tell a
   * refunded customer their bank disputed a payment. See
   * `supabase/billing/005_revoked_reason.sql`, which is written and UNAPPLIED, so
   * today every row is in that state.
   */
  revoked_reason: "dispute" | "refund" | null;
  created_at: string;
  updated_at: string;
};

type WebhookEventRow = {
  stripe_event_id: string;
  type: string;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
};

/** Columns the database fills in for us, so an insert need not supply them. */
type Defaulted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * TYPE ALIASES, NOT INTERFACES — and this is not style.
 *
 * `GenericTable` requires `Row: Record<string, unknown>`, and TypeScript does
 * NOT give an `interface` an implicit index signature, so an interface is not
 * assignable to it. When that constraint fails, `SupabaseClient` resolves
 * `Schema` to `never` — silently, with no error on this file — and every table
 * on the client becomes `never`. The symptom appears somewhere else entirely, as
 * "'user_id' does not exist in type 'never[]'" on an insert that is perfectly
 * correct. A type alias has the index signature and the whole thing works.
 */
export type BillingDatabase = {
  public: {
    Tables: {
      billing_customers: {
        Row: BillingCustomerRow;
        Insert: Defaulted<
          BillingCustomerRow,
          "created_at" | "updated_at" | "trial_lock_until"
        >;
        Update: Partial<BillingCustomerRow>;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: Defaulted<
          SubscriptionRow,
          // `courtesy_until` is optional so the fallback write, the one that
          // runs when 003 has not been applied, is a legal insert rather than a
          // type error. See `syncSubscription`.
          "id" | "created_at" | "updated_at" | "cancel_at_period_end" | "courtesy_until"
        >;
        Update: Partial<SubscriptionRow>;
        Relationships: [];
      };
      entitlements: {
        Row: EntitlementRow;
        Insert: Defaulted<
          EntitlementRow,
          "id" | "created_at" | "updated_at" | "is_active" | "revoked_reason"
        >;
        Update: Partial<EntitlementRow>;
        Relationships: [];
      };
      webhook_events: {
        Row: WebhookEventRow;
        Insert: Defaulted<WebhookEventRow, "received_at" | "processed_at">;
        Update: Partial<WebhookEventRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      subscription_status: SubscriptionStatus;
      entitlement_source: EntitlementSourceRow;
      entitlement_product: EntitlementProductRow;
    };
    CompositeTypes: Record<string, never>;
  };
};
