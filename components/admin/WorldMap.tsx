import { percent } from "@/lib/admin/aggregate"
import { cn } from "@/lib/utils"

/**
 * Where the users are, at IANA-REGION resolution.
 *
 * A SERVER COMPONENT and a FIXED amount of markup: ten shapes, always, whether
 * the input is three users or three hundred thousand. This is the whole design
 * constraint. The obvious "map" — a dot per user — grows the DOM with the
 * business, which is exactly backwards for a dashboard whose reason to exist is
 * that the business is growing. Region is also all the data there is: a
 * timezone is `Australia/Sydney`, and the honest thing to draw from that is a
 * continent, not a pin on a city.
 *
 * THE GEOGRAPHY IS DELIBERATELY LOW-POLY. Ten to twenty straight segments per
 * landmass, no coastlines, no projection library, no 200KB TopoJSON. It has to
 * be recognisable at a glance and obviously a diagram rather than a map you
 * could navigate by — nobody should look at this and wonder whether Tasmania is
 * to scale. Coordinates are a plain equirectangular mapping, `x = lon + 180`
 * and `y = 90 - lat` over a 360x180 viewBox, so a shape can be checked against
 * a real longitude by hand.
 *
 * `preserveAspectRatio` is left at its default (`xMidYMid meet`), unlike the
 * sparklines: a stretched world is a wrong world.
 */

export interface RegionCount {
  /** An IANA region: `Australia`, `America`, `Europe`, … A full zone
   *  (`Australia/Sydney`) is accepted and reduced to its region. */
  region: string
  count: number
}

/**
 * The drawable regions, in paint order.
 *
 * `Pacific`, `Indian` and `Atlantic` are ocean regions in the IANA database and
 * their zones are real inhabited islands (`Pacific/Auckland`,
 * `Indian/Antananarivo`, `Atlantic/Reykjavik`), so each is drawn as a small
 * scatter of islands in the right ocean rather than as a shaded sea. One `<path>`
 * with several subpaths, so the count of shapes stays fixed.
 */
const REGIONS: { key: string; label: string; d: string }[] = [
  {
    key: "antarctica",
    label: "Antarctica",
    d: "M 6,178 L 6,158 L 60,152 L 130,157 L 200,150 L 268,156 L 330,151 L 354,160 L 354,178 Z",
  },
  {
    key: "america",
    label: "America",
    // North and South America as one region, because IANA files both under
    // `America/` — plus Greenland (`America/Nuuk`) as a second subpath.
    d:
      "M 12,25 L 40,20 L 80,18 L 125,38 L 105,52 L 99,65 L 101,81 L 118,80 L 145,96 " +
      "L 132,115 L 114,142 L 106,140 L 110,110 L 99,96 L 102,86 L 85,75 L 75,68 " +
      "L 56,50 L 50,35 L 15,30 Z " +
      "M 138,14 L 158,10 L 163,24 L 149,32 L 137,25 Z",
  },
  {
    key: "europe",
    label: "Europe",
    d: "M 172,42 L 176,32 L 188,22 L 202,20 L 210,30 L 220,36 L 222,46 L 210,52 L 194,54 L 180,50 Z",
  },
  {
    key: "africa",
    label: "Africa",
    d:
      "M 166,56 L 190,52 L 214,56 L 224,64 L 233,72 L 226,88 L 214,106 L 205,122 " +
      "L 196,124 L 189,104 L 178,84 L 168,70 Z",
  },
  {
    key: "asia",
    label: "Asia",
    d:
      "M 222,46 L 236,26 L 276,14 L 326,14 L 356,24 L 348,42 L 330,50 L 316,58 " +
      "L 300,68 L 288,78 L 283,89 L 276,80 L 264,72 L 258,84 L 250,68 L 240,66 " +
      "L 232,74 L 225,78 L 218,60 Z",
  },
  {
    key: "australia",
    label: "Australia",
    // Mainland plus Tasmania. Tasmania is here because leaving it off is the
    // one omission an Australian founder would notice immediately.
    d:
      "M 292,114 L 300,104 L 312,100 L 326,104 L 334,112 L 330,124 L 316,128 L 300,124 Z " +
      "M 324,130 L 329,130 L 328,135 L 323,134 Z",
  },
  {
    key: "pacific",
    label: "Pacific",
    // New Zealand, Fiji, Melanesia, Micronesia, Hawaii.
    d:
      "M 344,126 L 350,122 L 354,132 L 348,138 L 344,134 Z " +
      "M 356,106 L 360,105 L 359,111 L 355,110 Z " +
      "M 318,94 L 332,91 L 334,96 L 320,99 Z " +
      "M 326,82 L 334,80 L 334,85 L 326,86 Z " +
      "M 20,68 L 26,66 L 27,71 L 21,72 Z",
  },
  {
    key: "indian",
    label: "Indian",
    // Madagascar, the Maldives, Mauritius, Cocos.
    d:
      "M 224,102 L 231,107 L 229,117 L 223,113 Z " +
      "M 251,84 L 254,83 L 254,88 L 251,89 Z " +
      "M 237,109 L 241,108 L 241,113 L 237,114 Z " +
      "M 274,100 L 278,99 L 278,104 L 274,105 Z",
  },
  {
    key: "atlantic",
    label: "Atlantic",
    // Iceland, the Azores, the Canaries, Cape Verde, Bermuda, South Georgia.
    d:
      "M 157,22 L 165,20 L 166,27 L 157,28 Z " +
      "M 149,50 L 154,49 L 154,54 L 149,55 Z " +
      "M 158,62 L 163,61 L 163,66 L 158,67 Z " +
      "M 152,72 L 157,71 L 157,76 L 152,77 Z " +
      "M 112,55 L 117,54 L 117,59 L 112,60 Z " +
      "M 138,140 L 144,139 L 144,145 L 138,146 Z",
  },
]

/**
 * `UTC` is a real IANA region and it is NOT A PLACE.
 *
 * A browser reports it when the machine is set to UTC, when the timezone is
 * unavailable, or when something upstream defaulted. Drawing it anywhere on the
 * map would invent a location; dropping it silently would quietly shrink the
 * total the shares are computed against. So it is counted, listed, and labelled
 * as what it is. Anything unrecognised is treated the same way.
 */
const OFF_MAP = "Not located"

interface Bucket {
  key: string
  label: string
  count: number
  /** False for `UTC` and anything unrecognised. */
  onMap: boolean
}

/** Fold the input into one bucket per region, summing any duplicates. */
function bucket(data: RegionCount[]): Bucket[] {
  const known = new Map(REGIONS.map((r) => [r.key, r.label]))
  const totals = new Map<string, Bucket>()

  for (const row of data) {
    if (!Number.isFinite(row.count) || row.count <= 0) continue
    // A full zone (`Australia/Sydney`) reduces to its region. Defensive: the
    // caller is meant to send a region, and a whole map going dark because one
    // call site sent a zone is a bad failure for a one-line guard to prevent.
    const key = String(row.region ?? "").trim().split("/")[0].toLowerCase()
    const label = known.get(key)
    const id = label ? key : OFF_MAP
    const existing = totals.get(id)
    if (existing) {
      existing.count += row.count
    } else {
      totals.set(id, {
        key: id,
        label: label ?? OFF_MAP,
        count: row.count,
        onMap: Boolean(label),
      })
    }
  }

  return [...totals.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  )
}

export function WorldMap({
  data,
  className,
}: {
  data: RegionCount[]
  className?: string
}) {
  const buckets = bucket(data)
  const total = buckets.reduce((n, b) => n + b.count, 0)
  const counts = new Map(buckets.map((b) => [b.key, b.count]))

  /**
   * INTENSITY IS SHARE, NORMALISED AGAINST THE LEADING REGION — the same call
   * `RankedBars` makes, and for the same reason. Raw share alone collapses:
   * spread ten regions evenly and every one of them is 10%, which on a
   * 0.28-to-0.9 ramp is ten identical barely-lit continents. Against the leader,
   * the shape of the distribution is what you see.
   *
   * The floor of 0.28 is the other half of it: a region with ONE user has to be
   * unmistakably lit, because "we have a user in Africa" is the single most
   * interesting thing this map can tell you and it must not fade into the
   * unlit land around it.
   */
  const lead = Math.max(...[...counts.values()], 0)
  const intensity = (count: number) =>
    lead > 0 ? Number((0.28 + 0.62 * (count / lead)).toFixed(3)) : 0

  const summary =
    total === 0
      ? "Nobody located yet."
      : `Users by region. ${buckets
          .map((b) => `${b.label} ${b.count.toLocaleString()}`)
          .join(", ")}.`

  return (
    <div className={cn("space-y-6", className)}>
      <svg
        viewBox="0 0 360 180"
        role="img"
        aria-label={summary}
        className="block h-auto w-full"
      >
        {REGIONS.map((region) => {
          const count = counts.get(region.key) ?? 0
          const on = count > 0
          const pct = percent(count, total)
          return (
            <path
              key={region.key}
              d={region.d}
              fill={on ? "var(--admin-map-on)" : "var(--admin-map-land)"}
              fillOpacity={on ? intensity(count) : 1}
              stroke="var(--admin-map-line)"
              strokeWidth="0.75"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            >
              {/* A hover name on every shape, lit or not — so the geography can
                  be checked without reading the legend, and so an empty region
                  still answers "what is that". */}
              <title>
                {on
                  ? `${region.label}: ${count.toLocaleString()}${pct === null ? "" : ` (${pct}%)`}`
                  : `${region.label}: none`}
              </title>
            </path>
          )
        })}
      </svg>

      {/**
       * THE TEXT FALLBACK, AND IT IS NOT ONLY FOR SCREEN READERS.
       *
       * Colour intensity cannot be read as a number by anyone — a map that only
       * shades is a map you cannot audit. This lists every bucket with its
       * count and share, INCLUDING the off-map one, so the figures on screen
       * always add up to the total the page reports. A map that draws 90 of 100
       * users and says nothing about the other 10 is lying quietly.
       */}
      {buckets.length === 0 ? (
        <p className="text-sm text-text-muted">Nobody located yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {buckets.map((b) => {
            const pct = percent(b.count, total)
            return (
              <li key={b.key} className="flex items-baseline gap-2.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 translate-y-[-1px] rounded-full"
                  style={{
                    backgroundColor: b.onMap
                      ? "var(--admin-map-on)"
                      : "var(--admin-map-land)",
                    opacity: b.onMap ? intensity(b.count) : 1,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                  {b.label}
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                  {b.count.toLocaleString()}
                  {pct !== null && (
                    <span className="ml-1.5 text-xs text-text-muted">{pct}%</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
