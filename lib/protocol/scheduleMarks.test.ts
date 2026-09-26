/**
 * The Schedule's marks, key and week stepper (the Protocol card and the
 * Schedule page).
 *
 * - W19 / D19: a MISSED day is its own mark (the grey square with a diagonal
 *   slash), never the same square as "nothing due", which stays as it was; no
 *   state colour on health data; the key draws exactly what the grid draws.
 * - W19: "This week" shows only off this week, and takes you back to it.
 * - D10: compound names in full, wrapping in the grid's name column, never
 *   truncated.
 *
 * The pure rules are tested directly; the markup is rendered to static HTML,
 * as `lib/protocol/pageAction.test.ts` does.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ScheduleCard } from "@/components/protocol/ScheduleCard"
import { SCHEDULE_NAME, ScheduleGrid } from "@/components/protocol/ScheduleGrid"
import { ScheduleWeeks } from "@/components/protocol/ScheduleWeeks"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import {
  WEEK_MARK,
  WEEK_MARK_INK,
  mondayOf,
  scheduleKey,
  shiftWeeks,
  weekDaysFrom,
  weekMatrix,
  weekNav,
  type WeekCellState,
} from "./scheduleWeek"

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Testosterone Enanthate",
  category: "anabolic",
  method: "im",
  dose: 250,
  unit: "mg",
  // Mon, Wed, Fri.
  schedule: { cadence: { type: "daysOfWeek", days: [1, 3, 5] }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

// The week of Mon 17 Aug 2026, seen on Thursday the 20th.
const MON = "2026-08-17"
const TODAY = "2026-08-20"
const DAYS = weekDaysFrom(MON)
/** Monday taken; Wednesday not, and Wednesday is past. */
const LOGS = {
  "2026-08-17": { c1: { amount: "250", unit: "mg", siteId: null, time24: "08:00" } },
} as unknown as DayLogs

const STATES: WeekCellState[] = ["logged", "due", "missed", "none", "paused"]
/** Any state, alarm or accent colour: none may draw a mark (ui-context). */
const STATE_COLOUR = /--state-|--accent-(amber|green|destructive)|--amber|red|green/i

describe("a missed day has its own mark (W19, D19)", () => {
  it("draws missed with a diagonal slash, and nothing else with one", () => {
    expect(WEEK_MARK.missed.slash).not.toBeNull()
    for (const s of STATES.filter((s) => s !== "missed")) expect(WEEK_MARK[s].slash).toBeNull()
  })

  it("leaves nothing due as it was: the bare hairline square", () => {
    expect(WEEK_MARK.none).toEqual({
      shape: "square",
      fill: null,
      outline: { ink: "hairline", width: 1 },
      slash: null,
    })
  })

  it("tells missed from nothing due by SHAPE, not only by a shade of grey", () => {
    // Both hollow squares...
    expect(WEEK_MARK.missed.fill).toBeNull()
    expect(WEEK_MARK.none.fill).toBeNull()
    // ...and the slash is what separates them, whatever the screen does to grey.
    expect(Boolean(WEEK_MARK.missed.slash)).not.toBe(Boolean(WEEK_MARK.none.slash))
  })

  it("draws every state differently", () => {
    const signatures = STATES.map((s) => JSON.stringify(WEEK_MARK[s]))
    expect(new Set(signatures).size).toBe(STATES.length)
  })

  it("uses no state colour on health data", () => {
    for (const ink of Object.values(WEEK_MARK_INK)) expect(ink).not.toMatch(STATE_COLOUR)
    expect(WEEK_MARK_INK.muted).toBe("var(--text-muted)")
    expect(WEEK_MARK_INK.hairline).toBe("var(--border-default)")
  })
})

describe("the key stays in step with the grid (W19)", () => {
  it("always lists missed and nothing due, and paused only when the week has one", () => {
    expect(scheduleKey(false).map((k) => k.label)).toEqual(["Logged", "Due", "Missed", "Nothing due"])
    expect(scheduleKey(true).map((k) => k.label)).toEqual([
      "Logged",
      "Due",
      "Missed",
      "Paused",
      "Nothing due",
    ])
  })
})

/** The mark elements in a rendered grid, in order. */
const marks = (html: string) => [...html.matchAll(/data-mark="(\w+)"/g)].map((m) => m[1])
/** The markup of the first element carrying `data-mark="<state>"`, up to its close. */
function markHtml(html: string, state: string): string {
  const at = html.indexOf(`data-mark="${state}"`)
  const open = html.lastIndexOf("<", at)
  const tag = html.slice(open + 1, html.indexOf(" ", open))
  return html.slice(open, html.indexOf(`</${tag}>`, at) + tag.length + 3)
}

describe("the grid draws the slash (W19, D19)", () => {
  const c = compound()
  const matrix = weekMatrix([c], DAYS, LOGS, TODAY)
  const grid = (legend: boolean) =>
    renderToStaticMarkup(
      createElement(ScheduleGrid, {
        compounds: [c],
        states: matrix.states,
        todayKey: TODAY,
        weekDays: DAYS,
        legend,
      }),
    )

  it("has the week the fixture describes", () => {
    expect(matrix.states.get("c1")).toEqual(["logged", "none", "missed", "none", "due", "none", "none"])
    expect(marks(grid(false))).toEqual(["logged", "none", "missed", "none", "due", "none", "none"])
  })

  it("strikes the missed square through, and not the nothing-due one", () => {
    const html = grid(false)
    expect(markHtml(html, "missed")).toMatch(/<svg[^>]*>[\s\S]*<path d="M2 10 10 2"[^>]*stroke="var\(--text-muted\)"/)
    expect(markHtml(html, "none")).not.toContain("<svg")
    expect(markHtml(html, "none")).toContain("var(--border-default)")
  })

  it("draws the key's Missed and Nothing due exactly as the grid does", () => {
    const html = grid(true)
    const key = html.slice(html.indexOf("<ul"))
    expect(key).toContain("Missed")
    expect(key).toContain("Nothing due")
    expect(markHtml(key, "missed")).toBe(markHtml(html, "missed"))
    expect(markHtml(key, "none")).toBe(markHtml(html, "none"))
  })

  it("puts no state colour in the markup", () => {
    expect(grid(true)).not.toMatch(/--state-|--accent-/)
  })

  it("draws the slash on the Protocol card too (it has no key)", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleCard, { compounds: [c], logs: LOGS, todayKey: TODAY }),
    )
    expect(markHtml(html, "missed")).toContain('d="M2 10 10 2"')
    // The card is one link; nothing interactive is nested inside it.
    expect(html).not.toContain("<button")
  })
})

describe("compound names in full (D10)", () => {
  const long = compound({ name: "Glow (BPC-157 + TB-500 + GHK-Cu)", category: "peptide" })
  const matrix = weekMatrix([long], DAYS, {} as DayLogs, TODAY)
  const html = renderToStaticMarkup(
    createElement(ScheduleGrid, {
      compounds: [long],
      states: matrix.states,
      todayKey: TODAY,
      weekDays: DAYS,
    }),
  )
  const nameCell = html.match(/<span data-schedule-namecol="[^"]*" class="([^"]*)">([^<]+)<\/span>/)

  it("wraps the name column rather than cutting it", () => {
    expect(SCHEDULE_NAME).not.toMatch(/\btruncate\b|line-clamp|text-ellipsis|whitespace-nowrap/)
    expect(SCHEDULE_NAME).toContain("break-words")
    expect(nameCell?.[1]).toContain("break-words")
    expect(nameCell?.[1]).not.toMatch(/\btruncate\b|line-clamp/)
  })

  it("prints the whole name", () => {
    expect(nameCell?.[2]).toBe("Glow (BPC-157 + TB-500 + GHK-Cu)")
  })
})

describe("the week stepper and This week (W19)", () => {
  const THIS = mondayOf(TODAY)
  const FLOOR = "2026-06-01"

  it("hides This week on this week, where there is nowhere to go", () => {
    expect(weekNav(THIS, THIS, FLOOR)).toEqual({
      canGoBack: true,
      canGoForward: false,
      away: false,
      toThisWeek: null,
    })
  })

  it("shows it on any past week, travelling forward", () => {
    const back3 = shiftWeeks(THIS, -3)
    expect(weekNav(back3, THIS, FLOOR)).toMatchObject({ away: true, toThisWeek: "forward", canGoForward: true })
  })

  it("shows it after the page sat open over a Sunday night", () => {
    // The grid stays on the week it was opened on; "this week" moved on.
    const opened = THIS
    const nextMonday = shiftWeeks(THIS, 1)
    expect(weekNav(opened, nextMonday, FLOOR)).toMatchObject({ away: true, toThisWeek: "forward" })
  })

  it("brings you back from a week ahead of today (a clock set back), where Next is off", () => {
    const ahead = shiftWeeks(THIS, 1)
    expect(weekNav(ahead, THIS, FLOOR)).toMatchObject({
      away: true,
      toThisWeek: "back",
      canGoForward: false,
    })
  })

  it("stops Previous at the history floor", () => {
    expect(weekNav(FLOOR, THIS, FLOOR).canGoBack).toBe(false)
    expect(weekNav(shiftWeeks(FLOOR, 1), THIS, FLOOR).canGoBack).toBe(true)
  })

  it("renders This week hidden and inert when the page opens (on this week)", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleWeeks, { compounds: [compound()], logs: LOGS, todayKey: TODAY }),
    )
    const pill = html.match(/<span class="schedule-thisweek"([^>]*)><button[^>]*>This week<\/button>/)
    expect(pill).not.toBeNull()
    expect(pill?.[1]).toContain('data-shown="false"')
    expect(pill?.[1]).toContain("inert")
  })

  it("hides it out of reach, and moves it only by transform and opacity, with a reduced-motion fade", () => {
    const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
    const rule = (sel: string, from = 0) => {
      const at = css.indexOf(`${sel} {`, from)
      return at < 0 ? "" : css.slice(at, css.indexOf("}", at))
    }
    const hidden = rule('.schedule-thisweek[data-shown="false"]')
    expect(hidden).toMatch(/opacity:\s*0/)
    expect(hidden).toMatch(/visibility:\s*hidden/)
    // Transform and opacity only (visibility just follows the fade).
    for (const r of [rule(".schedule-thisweek"), hidden]) {
      const props = [...r.matchAll(/(?:^|,|:)\s*(transform|opacity|visibility|[a-z-]+)\s+\d+m?s/g)].map((m) => m[1])
      expect(props).toEqual(expect.arrayContaining(["transform", "opacity"]))
      expect(props.every((p) => ["transform", "opacity", "visibility"].includes(p))).toBe(true)
    }
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".schedule-thisweek {")))
    const reducedBlock = reduced.slice(0, reduced.indexOf("@keyframes") > 0 ? reduced.indexOf("@keyframes") : 2000)
    expect(reducedBlock).toMatch(/\.schedule-thisweek[\s\S]*transform:\s*none/)
    expect(reducedBlock).toMatch(/\.schedule-thisweek[\s\S]*transition:\s*opacity/)
  })
})
