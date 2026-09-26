/**
 * THE TILE SWAP: which tile is pressed and which panel is shown, for a row of
 * tiles that opens one panel (Home's journal: Markers / Photos / Date; the dose
 * row's Site / Stock / Note works the same way). Pure, so the race is tested.
 *
 * Switching from one open tile to another fades the old panel out first, then
 * shows the new one. Cold review B31: two quick taps left the pressed tile and
 * the shown panel out of step, and could leave the panel blank, because the
 * landing of a fade was skipped when a newer fade's start cancelled it, and a
 * landing on the panel already shown changed nothing, so its fade-out was never
 * undone. Here:
 * - every press takes a new `token`; only the newest fade may land, and it
 *   lands whether its animation finished or was cancelled;
 * - every landing bumps `landed`, so the panel always fades back in, even when
 *   it lands on the panel it left.
 */

export interface SwapState<T> {
  /** The pressed tile (null: none, the panel is shut). */
  tile: T | null;
  /** The panel drawn (it stays drawn while the panel shuts). */
  shown: T | null;
  /** Bumped by every press: a fade may land only with the newest token. */
  token: number;
  /** Bumped by every landing: the panel's parts fade in again on each. */
  landed: number;
}

export type SwapStep = "close" | "direct" | "fade";

export function swapStart<T>(): SwapState<T> {
  return { tile: null, shown: null, token: 0, landed: 0 };
}

/**
 * A tile pressed. `animate` is false under reduced motion (or with no panel to
 * fade). Pressing the pressed tile shuts the panel (and cancels a fade in flight).
 */
export function pressTile<T>(s: SwapState<T>, next: T, animate: boolean): { state: SwapState<T>; step: SwapStep } {
  const token = s.token + 1;
  if (next === s.tile) return { state: { ...s, tile: null, token }, step: "close" };
  if (animate && s.tile !== null && s.shown !== null) return { state: { ...s, tile: next, token }, step: "fade" };
  return { state: { tile: next, shown: next, token, landed: s.landed + 1 }, step: "direct" };
}

/** The panel shut from elsewhere (its arrow, or the card closing). */
export function shutPanel<T>(s: SwapState<T>): SwapState<T> {
  return { ...s, tile: null, token: s.token + 1 };
}

/** A fade-out has ended (finished or cancelled): the newest one lands. */
export function landSwap<T>(s: SwapState<T>, token: number, next: T): SwapState<T> {
  if (token !== s.token) return s;
  return { ...s, shown: next, landed: s.landed + 1 };
}
