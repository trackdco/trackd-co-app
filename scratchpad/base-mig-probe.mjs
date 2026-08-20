/** READ-ONLY probe: 003 = subscriptions.courtesy_until, 005 = entitlements.revoked_reason. */
import { admin } from "./admin.mjs";
const c3 = await admin.from("subscriptions").select("courtesy_until").limit(1);
console.log("003 subscriptions.courtesy_until :", c3.error ? `ABSENT (${c3.error.code} ${c3.error.message})` : "PRESENT — applied");
const c5 = await admin.from("entitlements").select("revoked_reason").limit(1);
console.log("005 entitlements.revoked_reason  :", c5.error ? `ABSENT (${c5.error.code} ${c5.error.message})` : "PRESENT — applied");
