import { notFound } from "next/navigation"

import { StockPreview } from "./StockPreview"

/**
 * DEV-ONLY preview of the add-stock sheet (Spec w2b-13, Steps 1-4) — all four
 * inventory forms, viewable WITHOUT signing in and without the migrations being
 * applied. 404s in production. The real sheet lives behind Protocol → Stock.
 */
export default function PreviewStockPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <StockPreview />
}
