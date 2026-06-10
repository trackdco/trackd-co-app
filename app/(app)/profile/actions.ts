"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Profile avatar server actions (Context/Feature Specs/08 → B3). The cropped,
 * resized image is uploaded client-side straight to the private `avatars` bucket
 * (storage RLS enforces the `<auth.uid()>/…` path); these actions just record /
 * clear the chosen object path on the user's own profile row. RLS scopes every
 * write to the signed-in user; we also re-check the path's owner segment here as
 * defence in depth, and never trust the client for ownership.
 */
export type AvatarResult = { ok: boolean; error?: string };

export async function setAvatarPath(path: string): Promise<AvatarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // The path must live in this user's own folder (matches the storage policy).
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Invalid avatar path." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save your photo." };

  revalidatePath("/profile");
  return { ok: true };
}

export async function clearAvatar(): Promise<AvatarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  // Best-effort remove of the stored object (RLS scopes it to the owner anyway).
  const path = profile?.avatar_path as string | null | undefined;
  if (path) {
    await supabase.storage.from("avatars").remove([path]);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't remove your photo." };

  revalidatePath("/profile");
  return { ok: true };
}
