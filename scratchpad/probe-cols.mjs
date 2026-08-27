/** Probe only: which columns does the `subscriptions` mirror actually carry? Reads nothing, writes nothing. */
import { admin } from "./admin.mjs";
for (const col of ["trackd_grace_until","grace_until","courtesy_until","trial_ends_at","current_period_end","cancel_at_period_end","status","stripe_price_id","stripe_subscription_id","metadata"]) {
  const { error } = await admin.from("subscriptions").select(col).limit(1);
  console.log(`${error ? "  absent" : "PRESENT"}  ${col}${error ? `  (${error.code})` : ""}`);
}
