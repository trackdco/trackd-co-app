import { notFound } from "next/navigation";

import { OpenSafariScreen } from "@/components/preview/install/screens";

export default function StopPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OpenSafariScreen />;
}
