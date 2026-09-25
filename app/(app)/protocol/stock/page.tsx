import { redirect } from "next/navigation"

/**
 * The Stock page is gone (Adrian, final check round four: "the simplest way is
 * to control all of the stock ... where the protocol thing is"). Stock lives on
 * Protocol's compounds row and in each compound's sheet, so an old link lands
 * there.
 */
export default function ProtocolStockPage() {
  redirect("/protocol")
}
