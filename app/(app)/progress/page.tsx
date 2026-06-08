import type { Metadata } from "next";

export const metadata: Metadata = { title: "Progress — Trackd Co" };

// Placeholder Progress screen. Blank for now — built out later.
export default function ProgressPage() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <h1 className="font-display text-4xl text-foreground">Progress</h1>
    </div>
  );
}
