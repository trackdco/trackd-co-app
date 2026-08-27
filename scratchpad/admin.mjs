import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
export const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]; }));
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const BASE = process.env.BASE ?? "http://localhost:3100";
/**
 * ⚠️ THE QA FIXTURE PASSWORD LIVES IN `.env.local`, NOT HERE (D89).
 *
 * It is only ever used on `@trackd-qa.invalid` accounts that are torn down by id,
 * so it is low risk — but this file is TRACKED now, and a credential in a
 * repository is a question somebody has to answer later. One line removes it.
 */
export const QA_PASSWORD = env.QA_TEST_PASSWORD;
if (!QA_PASSWORD) throw new Error("QA_TEST_PASSWORD is not set in .env.local");
export const admin = createClient(SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken:false, persistSession:false } });
/**
 * ⚠️ THE PROFILE UPDATE IS CHECKED, AND A ZERO-ROW UPDATE IS A FAILURE (5.4).
 *
 * This discarded the error, and **a PostgREST update matching ZERO ROWS is not
 * an error** — so if the `profiles` row did not exist yet (the trigger that
 * creates it races the `createUser` call), the write landed nowhere and the
 * account silently kept the DEFAULT timezone.
 *
 * ⚠️ WHY THAT IS EXPENSIVE HERE: 65 drivers import this, and every date they
 * assert is formatted in that timezone. A POSITIVE date check fails loudly when
 * the zone is wrong — the string simply differs. A NEGATIVE one ("no date
 * appears", "it does not say 17 Sept") goes VACUOUSLY GREEN, because a date
 * formatted in the wrong zone is still not the date it was looking for.
 *
 * The line above it — `createUser` — already checked its error. This is the same
 * rule applied one line down.
 *
 * ⚠️ THE PROPERTY: the fixture is fully seeded before any driver reads a date
 * off it. That needs the update to have SUCCEEDED and to have touched a row, so
 * both are asserted: the error, and the returned row itself. `select()` makes
 * PostgREST return what it wrote, which is the only way to tell a matched update
 * from a matched-nothing one.
 */
export async function makeUser(tag, { password = QA_PASSWORD } = {}) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2,7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  const TZ = "Australia/Sydney";
  const { data: rows, error: profileError } = await admin.from("profiles")
    .update({ is_18_plus: true, tos_accepted_at: new Date().toISOString(), date_of_birth: "1990-01-01", timezone: TZ })
    .eq("id", data.user.id)
    .select("id, timezone");
  if (profileError) throw new Error(`makeUser profile update for ${email}: ${profileError.message}`);
  if (!rows || rows.length !== 1) {
    throw new Error(
      `makeUser profile update for ${email} matched ${rows?.length ?? 0} rows, not 1 — ` +
      `the account has the DEFAULT timezone and every date asserted against it is unsound`,
    );
  }
  if (rows[0].timezone !== TZ) {
    throw new Error(`makeUser: timezone is ${rows[0].timezone}, expected ${TZ}`);
  }
  return { id: data.user.id, email, password };
}
/** ⚠️ BY ID ONLY. Never by domain — a previous agent's sweep deleted 16 real fixtures. */
export async function dropUser(id) { if (!id) throw new Error("need an id"); await admin.auth.admin.deleteUser(id); }
export async function signIn({ email, password }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method:"POST",
    headers:{ apikey: PUBLISHABLE, "content-type":"application/json" }, body: JSON.stringify({ email, password }) });
  const session = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(session));
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const payload = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const CHUNK = 3180; const jar = new Map();
  if (payload.length <= CHUNK) jar.set(`sb-${ref}-auth-token`, payload);
  else for (let i=0,n=0;i<payload.length;i+=CHUNK,n+=1) jar.set(`sb-${ref}-auth-token.${n}`, payload.slice(i,i+CHUNK));
  return { jar, accessToken: session.access_token,
    async fetch(path, init={}) { return fetch(path.startsWith("http")?path:`${BASE}${path}`, { ...init, redirect: init.redirect ?? "manual",
      headers: { ...(init.headers ?? {}), cookie: [...jar].map(([k,v])=>`${k}=${v}`).join("; ") } }); } };
}
