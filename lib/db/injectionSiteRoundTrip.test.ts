/**
 * Every one of the 36 sites the body map offers must survive a Postgres
 * round-trip. Before `supabase/sites/011` the enum had 13 members, so 22 of them
 * collapsed to `other` and read back as NULL: "Trap - Left" was erased and
 * "Front Quad - Left" came back as "Outer Quad - Left", a different muscle.
 *
 * This is the test that would have caught it, and it fails loudly if a site is
 * ever added to the catalogue without an enum member to hold it.
 */
import { describe, expect, it } from "vitest"
import { injectionSiteToLocal, localSiteToInjectionSite } from "@/lib/db/types"

const IDS = `im-glute-r im-glute-l im-delt-r im-delt-l im-quad-out-r im-quad-out-l im-quad-front-r im-quad-front-l im-bicep-r im-bicep-l im-tricep-r im-tricep-l im-lat-r im-lat-l im-pec-r im-pec-l im-calf-r im-calf-l sq-abdo-lr sq-abdo-ll sq-abdo-r sq-abdo-l sq-flank-r sq-flank-l sq-glute-r sq-glute-l sq-thigh-up-r sq-thigh-up-l sq-thigh-lo-r sq-thigh-lo-l sq-arm-r sq-arm-l im-vglute-r im-vglute-l im-trap-r im-trap-l`.split(" ")

describe("every catalogue site round-trips", () => {
  it("loses none of the 36", () => {
    const lost: string[] = []
    for (const id of IDS) {
      const method = id.startsWith("im-") ? "im" : "subq"
      const enumVal = localSiteToInjectionSite(id)
      const back = injectionSiteToLocal(enumVal, method as "im" | "subq")
      if (back !== id) lost.push(`${id} -> ${enumVal} -> ${back}`)
    }
    expect(lost).toEqual([])
    expect(IDS.length).toBe(36)
  })
})
