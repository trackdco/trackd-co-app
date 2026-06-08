"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Signs the user out (clears the Supabase session cookies) and returns to the
 * public landing. Invoked from a <form action={signOut}> so it works without
 * client JS.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
