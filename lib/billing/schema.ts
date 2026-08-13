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
          "id" | "created_at" | "updated_at" | "cancel_at_period_end"
        >;
        Update: Partial<SubscriptionRow>;
        Relationships: [];
      };
      entitlements: {
        Row: EntitlementRow;
        Insert: Defaulted<
          EntitlementRow,
          "id" | "created_at" | "updated_at" | "is_active"
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
