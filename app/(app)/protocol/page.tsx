import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Protocol — Trackd Co" };

// Placeholder Protocol screen. Blank for now — built out later.
export default function ProtocolPage() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <h1 className="font-display text-4xl text-foreground">My Protocol</h1>
    </div>
  );
}
