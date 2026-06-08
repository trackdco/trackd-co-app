import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Profile — Trackd Co" };

// Placeholder My Profile screen. Blank for now — built out later.
export default function ProfilePage() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <h1 className="font-display text-4xl text-foreground">My Profile</h1>
    </div>
  );
}
