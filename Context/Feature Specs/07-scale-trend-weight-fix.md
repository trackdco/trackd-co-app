# Spec — Weight View: Scale / Trend Toggle Opacity Crossfade

> Agent: read `AI-workflow-rules.md`, `architecture.md`, `code-standards.md`, and `ui-context.md` first. Locate the existing weight view/chart component (Progress area) via `architecture.md` and confirm the file before editing. One step at a time; verify before proceeding. No TS/lint errors.

---

## 1. Goal
On the weight view, selecting **Scale** weight dims **Trend**, and selecting **Trend** dims **Scale** — and the opacity change is an **animated fade**, not an instant snap. The active series sits at full opacity; the inactive one fades down.

---

## 2. Out of Scope — do NOT
- Do **NOT** change the underlying weight data, the scale-vs-trend calculation, or the chart type.
- Do **NOT** remove or hide either series — both stay visible; only their opacity changes.
- Do **NOT** restructure the Progress screen or add new components.
- Do **NOT** introduce one-off animation durations — reuse the app's existing transition tokens.

---

## 3. Design Decisions
- The toggle has two states: **Scale active** and **Trend active**.
- Active series → full opacity. Inactive series → dimmed (suggest ~35% opacity; align the exact value to `ui-context.md`).
- The opacity change must **transition** (fade in / fade out), using the same duration and easing as the existing nav selection fade per `ui-context.md`. Tapping the other option reverses the fade smoothly.
- This applies to both the series rendering in the chart and the corresponding toggle labels/values (the dimmed side reads as visually de-emphasized, consistent with the rest of the app).

---

## 4. Implementation
- In the weight view component, drive opacity from the active-toggle state.
- Apply a CSS/animated `opacity` transition to each series (and its label/value) so switching crossfades rather than snaps. Match the app's standard transition timing/easing.
- Ensure the initial/default state renders with the correct series at full opacity and the other already dimmed (no flash on first paint).

### Build order
1. Wire opacity to the active-toggle state (no transition yet). Verify Scale dims Trend and vice-versa.
2. Add the fade transition (duration/easing from `ui-context.md`). Verify the crossfade is smooth both directions and on first render.

---

## 5. Check When Done
- [ ] Selecting Scale dims Trend; selecting Trend dims Scale.
- [ ] The opacity change fades in/out — no instant snap — in both directions.
- [ ] Fade duration/easing matches the app's existing motion (`ui-context.md`).
- [ ] Both series remain visible; data and calculations unchanged.
- [ ] No flash of wrong state on first render.
- [ ] No TS or lint errors; build is clean.

Also whats very important is that you chang the weight entrys to be xxx.xx so no more than three digits for the kg and lbs and no more than two decimal points. also i need you to set realistic limits for lows in height and weight. obviously there will be outliers in both but keep it geberous but realisitc. ask me before you do it and give me some reference ranges. All of this last paragraph is about tracking/logging the compounds. Also, what I want you to do is, on the plus menu, "Track your weight". It's simply the weight tracking option, and it just says "Track your weight". It's a text input. You put in your text, and then it just says "Done". I think if you even had "Track your weight" and it had the weight graph that slid up and faded up, that would be cool as well to see. Like a card pop up that says "Track your weight", or "Log your weight". Once the card fades up, then another card fades up on top of that; it's the graph of your weight with the trends so you can see it. When you log it, it adds it to it. Also, what I want you to do with the white section is you can click on it. And then when you click on it, you can simply select:
- one week
- one month
- three months
- six months
- one year
- all time
That way, you can expand the track based on the time period, so you can see how long the term thing
