/**
 * "Reading the curve" (Adrian's walk, W2): the "?" on a compound's page and
 * on Home's open graph explains with a DRAWN graph and a plain key under it,
 * as the Half-life page's own explainer does, not with leaders pointed at the
 * reader's own chart. It need not be the reader's graph, so it is one example
 * that shows every mark the key names, well apart: the line so far with its
 * fill, the likely range, Now, the ½ line, the doses taken and the ones to
 * come, and the dashed line ahead.
 *
 * The example is drawn by the same model and the same graph as every real one,
 * so it can never show a mark the app does not draw. Pure: no React.
 */
import type { HalfLifeSource } from "./compoundCurve"
import { halfGoneAtH, type Dose } from "./model"

export interface GuideExample {
  source: HalfLifeSource
  taken: Dose[]
  toCome: Dose[]
  nowH: number
  t0: number
  t1: number
  /** Where the ½ line sits. */
  halfAtH: number
}

const DAY = 24

/**
 * A two-day half-life injected every three days: eight days back, five and a
 * half ahead, Now a day after the last dose. On this axis the marks sit apart
 * (tested): Now, then the ½ line a day and a bit on, then the next dose.
 */
export function guideExample(): GuideExample {
  const source: HalfLifeSource = { halfLifeH: 2 * DAY, estimated: false, route: "injection" }
  const taken: Dose[] = [-7, -4, -1].map((d) => ({ atH: d * DAY, amount: 1 }))
  const toCome: Dose[] = [2, 5].map((d) => ({ atH: d * DAY, amount: 1 }))
  const nowH = 0
  const halfAtH = halfGoneAtH([...taken, ...toCome], nowH, source.halfLifeH, source.route) as number
  return { source, taken, toCome, nowH, t0: -8 * DAY, t1: 5.5 * DAY, halfAtH }
}
