import { notFound } from "next/navigation";

import { PresellWithSkins } from "@/components/preview/install/screens";

export default function PresellPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PresellWithSkins />;
}
