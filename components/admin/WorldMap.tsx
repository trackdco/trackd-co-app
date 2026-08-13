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
    d: "M 4,176 L 30,166 L 62,161 L 96,164 L 132,159 L 168,163 L 204,158 L 240,163 L 274,159 L 308,164 L 340,168 L 356,176 L 356,180 L 4,180 Z",
  },
  {
    key: "america",
    label: "America",
    // North America, Central America, South America and Greenland — IANA files
    // all of them under `America/`. Traced from real coastline coordinates on an
    // equirectangular projection (x = lon + 180, y = 90 − lat), which is why the
    // Gulf of Mexico, Florida, Baja, the Brazilian bulge and the taper to Tierra
    // del Fuego all land where an atlas puts them.
    d:
      "M 11,24 L 22,21 L 33,23 L 44,20 L 52,24 L 47,29 L 55,31 L 66,26 L 78,22 " +
      "L 92,20 L 104,23 L 112,28 L 120,26 L 126,31 L 124,38 L 118,44 L 121,47 " +
      "L 113,46 L 106,52 L 101,60 L 99,66 L 96,63 L 92,64 L 86,61 L 80,63 " +
      "L 74,70 L 79,74 L 88,78 L 95,80 L 101,82 L 105,80 L 112,79 L 118,80 " +
      "L 126,84 L 137,88 L 145,93 L 146,99 L 141,106 L 137,113 L 131,119 " +
      "L 124,125 L 119,131 L 115,139 L 112,146 L 108,142 L 108,133 L 105,124 " +
      "L 103,112 L 101,101 L 99,92 L 96,85 L 89,79 L 82,74 L 74,68 L 68,61 " +
      "L 63,55 L 57,49 L 53,42 L 47,37 L 38,34 L 27,32 L 16,30 Z " +
      "M 133,29 L 141,22 L 150,12 L 158,8 L 164,12 L 162,20 L 155,27 L 148,33 L 139,34 Z",
  },
  {
    key: "europe",
    label: "Europe",
    d:
      "M 170,54 L 175,49 L 172,45 L 178,43 L 176,39 L 180,37 L 178,33 L 184,31 " +
      "L 189,26 L 194,20 L 199,17 L 204,20 L 202,26 L 208,24 L 214,22 L 221,24 " +
      "L 228,28 L 232,34 L 228,40 L 222,43 L 216,45 L 210,47 L 205,51 L 199,53 " +
      "L 193,50 L 188,53 L 182,52 L 177,55 Z " +
      "M 175,35 L 179,32 L 181,36 L 177,38 Z",
  },
  {
    key: "africa",
    label: "Africa",
    d:
      "M 166,68 L 170,60 L 176,56 L 184,54 L 192,53 L 200,54 L 208,56 L 214,59 " +
      "L 219,64 L 223,70 L 226,76 L 231,79 L 234,84 L 230,88 L 225,92 L 222,98 " +
      "L 219,105 L 215,112 L 210,119 L 204,124 L 197,126 L 192,121 L 190,113 " +
      "L 188,105 L 186,97 L 184,90 L 181,86 L 176,84 L 172,80 L 168,76 L 165,72 Z",
  },
  {
    key: "asia",
    label: "Asia",
    d:
      "M 231,32 L 238,26 L 246,21 L 256,17 L 268,15 L 280,14 L 292,16 L 304,19 " +
      "L 316,22 L 328,26 L 338,31 L 344,37 L 340,42 L 332,45 L 324,48 L 318,52 " +
      "L 312,56 L 306,59 L 300,62 L 296,68 L 290,72 L 284,77 L 278,82 L 272,79 " +
      "L 268,73 L 262,70 L 258,76 L 254,82 L 250,77 L 248,71 L 244,66 L 238,63 " +
      "L 232,60 L 226,56 L 220,52 L 216,47 L 222,44 L 228,41 L 232,36 Z " +
      "M 318,50 L 323,45 L 327,49 L 323,55 Z",
  },
  {
    key: "australia",
    label: "Australia",
    d:
      "M 293,113 L 299,107 L 306,103 L 313,101 L 320,103 L 326,106 L 331,111 " +
      "L 334,117 L 332,123 L 327,127 L 320,129 L 312,128 L 305,126 L 298,123 " +
      "L 294,118 Z " +
      "M 324,132 L 329,131 L 330,136 L 325,137 Z",
  },
  {
    key: "pacific",
    label: "Pacific",
    // Real inhabited zones — Pacific/Auckland, /Fiji, /Honolulu, /Guam.
    d:
      "M 337,124 L 342,121 L 345,126 L 340,130 Z " +
      "M 348,110 L 352,108 L 354,113 L 349,114 Z " +
      "M 22,63 L 27,61 L 29,65 L 24,67 Z " +
      "M 330,84 L 334,82 L 336,86 L 331,88 Z",
  },
  {
    key: "indian",
    label: "Indian",
    // Indian/Antananarivo, /Maldives, /Mauritius.
    d:
      "M 227,108 L 231,103 L 234,108 L 231,115 L 228,113 Z " +
      "M 253,88 L 256,87 L 257,91 L 254,92 Z " +
      "M 240,112 L 243,111 L 244,115 L 241,116 Z",
  },
  {
    key: "atlantic",
    label: "Atlantic",
    // Atlantic/Reykjavik, /Azores, /Cape_Verde, /South_Georgia.
    d:
      "M 156,25 L 163,22 L 166,27 L 159,30 Z " +
      "M 152,49 L 156,47 L 158,51 L 153,53 Z " +
      "M 158,71 L 162,69 L 164,73 L 159,75 Z " +
      "M 143,144 L 147,142 L 149,146 L 144,148 Z",
  },
]

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
