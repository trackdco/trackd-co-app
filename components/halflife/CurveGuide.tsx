"use client"

import { GraphKey } from "@/components/halflife/HalfLifeGraph"

/**
 * "Reading the curve", from the "?" beside a compound's title (build-brief-
 * final §3.11, as Adrian's walk changed it, W2): the SAME pop-up the "?" in
 * Home's open graph opens. It explains with a drawn graph, like the Half-life
 * page's own explainer, and a plain key under it in place of the leaders the
 * brief first asked for; the leaders' layout (`layoutGuide`) stays in the lib,
 * tested, should they come back. Drawn in the compound's hue.
 */
export function CurveGuide({ open, onClose, hue }: { open: boolean; onClose: () => void; hue?: string }) {
  return <GraphKey open={open} onClose={onClose} hue={hue} />
}
