import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
export const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]; }));
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const BASE = process.env.BASE ?? "http://localhost:3100";
export const admin = createClient(SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken:false, persistSession:false } });
export async function makeUser(tag, { password = "Test-passw0rd!" } = {}) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2,7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  await admin.from("profiles").update({ is_18_plus: true, tos_accepted_at: new Date().toISOString(), date_of_birth: "1990-01-01", timezone: "Australia/Sydney" }).eq("id", data.user.id);
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
