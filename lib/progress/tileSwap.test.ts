import { describe, expect, it } from "vitest";

import { landSwap, pressTile, shutPanel, swapStart, type SwapState } from "./tileSwap";

type T = "site" | "note" | "stock";
const open = (t: T): SwapState<T> => pressTile(swapStart<T>(), t, true).state;

describe("B31: the tile swap lands on the last tile tapped", () => {
  it("opening from shut shows the tile at once", () => {
    const { state, step } = pressTile(swapStart<T>(), "site", true);
    expect(step).toBe("direct");
    expect(state).toMatchObject({ tile: "site", shown: "site", landed: 1 });
  });

  it("two quick taps: only the newer fade lands, even if the older finishes last", () => {
    let s = open("site");
    const a = pressTile(s, "note", true);
    expect(a.step).toBe("fade");
    s = a.state;
    const b = pressTile(s, "stock", true);
    s = b.state;
    // The first fade was cancelled by the second: its landing is refused...
    s = landSwap(s, a.state.token, "note");
    expect(s.shown).toBe("site");
    // ...and the second lands, pressed and shown in step.
    s = landSwap(s, b.state.token, "stock");
    expect(s).toMatchObject({ tile: "stock", shown: "stock" });
  });

  it("tapping back to the tile already shown still brings the panel back (never blank)", () => {
    let s = open("site");
    const a = pressTile(s, "note", true);
    const b = pressTile(a.state, "site", true);
    const before = b.state.landed;
    s = landSwap(b.state, b.state.token, "site");
    expect(s.shown).toBe("site");
    // A landing always counts, so the parts fade back in.
    expect(s.landed).toBe(before + 1);
  });

  it("shutting mid-fade cancels the landing; the next open fades in afresh", () => {
    const s0 = open("site");
    const a = pressTile(s0, "note", true);
    const shut = shutPanel(a.state);
    expect(landSwap(shut, a.state.token, "note")).toBe(shut);
    const again = pressTile(shut, "site", true);
    expect(again.step).toBe("direct");
    expect(again.state.landed).toBe(shut.landed + 1);
  });

  it("the pressed tile again shuts the panel", () => {
    const { state, step } = pressTile(open("site"), "site", true);
    expect(step).toBe("close");
    expect(state.tile).toBeNull();
  });

  it("reduced motion swaps directly", () => {
    const { state, step } = pressTile(open("site"), "note", false);
    expect(step).toBe("direct");
    expect(state).toMatchObject({ tile: "note", shown: "note" });
  });
});
