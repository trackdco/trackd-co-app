import { notFound } from "next/navigation";

import { ReturnedWithCases } from "@/components/preview/install/screens";

export default function ReturnedPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReturnedWithCases />;
}
