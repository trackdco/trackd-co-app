/** Probe only: does `subscriptions.courtesy_until` exist? Reads nothing else, writes nothing. */
import { admin } from "./admin.mjs";
const { data, error } = await admin.from("subscriptions").select("courtesy_until").limit(1);
if (error) console.log(`003 NOT APPLIED — code=${error.code} ${error.message}`);
else console.log(`003 APPLIED — read ok, ${data.length} rows (empty set is the expected answer)`);
