import type { Metadata } from "next";

export const metadata: Metadata = { title: "Weight — Trackd Co" };

// Placeholder weight-detail screen — the Home Weight card navigates here.
// A normal full page (no week-strip header); built out later.
export default function WeightPage() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <h1 className="font-display text-4xl text-foreground">Weight</h1>
    </div>
  );
}
