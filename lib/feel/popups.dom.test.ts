/**
 * THE POP-UPS AND THE TOAST, DRIVEN BY THE REAL react-dom (cold review B9,
 * B10, B36, S4). The repo has no jsdom, so this file carries a minimal DOM:
 * just enough for react-dom/client to mount, portal, attach refs, run layout
 * and passive effects, move focus and dispatch events. Every `animate()` call
 * is recorded, and window keydown listeners can be driven by hand.
 *
 * The DOM is installed BEFORE react-dom is first imported (in `beforeAll`),
 * since react-dom reads the globals when it loads.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import type * as ReactNS from "react"
import type * as ReactDomClient from "react-dom/client"

/* ------------------------------------------------------------ fake DOM --- */

const animateLog: { el: FakeElement; keyframes: unknown }[] = []
/** While true, every `animate()` stays running until `releaseAnimations()`. */
let holdAnimations = false
const held: (() => void)[] = []
function releaseAnimations() {
  holdAnimations = false
  while (held.length) held.shift()!()
}

class FakeStyle {
  [k: string]: unknown
  setProperty(k: string, v: string) {
    this[k] = v
  }
  removeProperty(k: string) {
    delete this[k]
  }
}

type Listener = { type: string; fn: (e: unknown) => void; capture: boolean }

class FakeNode {
  nodeType = 0
  nodeName = ""
  parentNode: FakeNode | null = null
  childNodes: FakeNode[] = []
  ownerDocument: FakeDocument | null = null
  listeners: Listener[] = []
  get firstChild() {
    return this.childNodes[0] ?? null
  }
  get parentElement(): FakeNode | null {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null
  }
  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null
    const s = this.parentNode.childNodes
    return s[s.indexOf(this) + 1] ?? null
  }
  get previousSibling(): FakeNode | null {
    if (!this.parentNode) return null
    const s = this.parentNode.childNodes
    return s[s.indexOf(this) - 1] ?? null
  }
  appendChild(c: FakeNode) {
    if (c.parentNode) c.parentNode.removeChild(c)
    c.parentNode = this
    this.childNodes.push(c)
    return c
  }
  insertBefore(c: FakeNode, ref: FakeNode | null) {
    if (!ref) return this.appendChild(c)
    if (c.parentNode) c.parentNode.removeChild(c)
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, c)
    c.parentNode = this
    return c
  }
  removeChild(c: FakeNode) {
    const i = this.childNodes.indexOf(c)
    if (i >= 0) this.childNodes.splice(i, 1)
    c.parentNode = null
    return c
  }
  contains(n: FakeNode | null): boolean {
    while (n) {
      if (n === this) return true
      n = n.parentNode
    }
    return false
  }
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("")
  }
  set textContent(v: string) {
    for (const c of this.childNodes) c.parentNode = null
    this.childNodes = []
    if (v) this.appendChild(this.ownerDocument!.createTextNode(v))
  }
  addEventListener(type: string, fn: (e: unknown) => void, opts?: boolean | { capture?: boolean }) {
    const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture)
    this.listeners.push({ type, fn, capture })
  }
  removeEventListener(type: string, fn: (e: unknown) => void, opts?: boolean | { capture?: boolean }) {
    const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture)
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture))
  }
}

class FakeText extends FakeNode {
  nodeType = 3
  nodeName = "#text"
  nodeValue: string
  constructor(v: string) {
    super()
    this.nodeValue = v
  }
  get data() {
    return this.nodeValue
  }
  set data(v: string) {
    this.nodeValue = v
  }
  get textContent() {
    return this.nodeValue
  }
  set textContent(v: string) {
    this.nodeValue = v
  }
}

type Simple = { tag?: string; attrs: { name: string; value?: string; not?: boolean }[] }

/** Compound selectors only (tag, [attr], [attr=v], :not([attr=v])), comma lists. */
function parse(sel: string): Simple[] {
  return sel.split(",").map((part) => {
    const s = part.trim()
    const out: Simple = { attrs: [] }
    const tag = s.match(/^[a-zA-Z]+/)
    if (tag) out.tag = tag[0].toUpperCase()
    const re = /(:not\()?\[([a-zA-Z-]+)(?:=["']?([^"'\]]*)["']?)?\]\)?/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) out.attrs.push({ name: m[2], value: m[3], not: Boolean(m[1]) })
    return out
  })
}

function matches(el: FakeElement, sel: string): boolean {
  return parse(sel).some((p) => {
    if (p.tag && el.tagName !== p.tag) return false
    return p.attrs.every((a) => {
      const has = el.hasAttribute(a.name)
      const ok = a.value === undefined ? has : el.getAttribute(a.name) === a.value
      return a.not ? !ok : ok
    })
  })
}

class FakeElement extends FakeNode {
  nodeType = 1
  tagName: string
  namespaceURI = "http://www.w3.org/1999/xhtml"
  attrs = new Map<string, string>()
  style = new FakeStyle()
  /** What `getAnimations()` reports: set to [{}] to play a sheet still rising. */
  running: unknown[] = []
  constructor(tag: string) {
    super()
    this.tagName = tag.toUpperCase()
    this.nodeName = this.tagName
  }
  setAttribute(k: string, v: unknown) {
    this.attrs.set(k, String(v))
  }
  getAttribute(k: string) {
    return this.attrs.has(k) ? this.attrs.get(k)! : null
  }
  hasAttribute(k: string) {
    return this.attrs.has(k)
  }
  removeAttribute(k: string) {
    this.attrs.delete(k)
  }
  getAttributeNames() {
    return [...this.attrs.keys()]
  }
  get className() {
    return this.getAttribute("class") ?? ""
  }
  set className(v: string) {
    this.setAttribute("class", v)
  }
  get isConnected() {
    return this.ownerDocument!.documentElement.contains(this)
  }
  /** Focus moves as in a browser: focusout on what had it, focusin here
   *  (React's onBlur / onFocus listen to those). */
  focus() {
    if (!this.isConnected) return
    const doc = this.ownerDocument!
    const prev = doc.activeElement
    if (prev === this) return
    doc.activeElement = this
    if (prev && prev !== doc.body && prev.isConnected) fire(prev, "focusout")
    fire(this, "focusin")
  }
  blur() {
    const doc = this.ownerDocument!
    if (doc.activeElement !== this) return
    doc.activeElement = doc.body
    fire(this, "focusout")
  }
  matches(sel: string) {
    return matches(this, sel)
  }
  closest(sel: string): FakeElement | null {
    if (matches(this, sel)) return this
    let n: FakeNode | null = this.parentNode
    while (n && n.nodeType === 1) {
      if (matches(n as FakeElement, sel)) return n as FakeElement
      n = n.parentNode
    }
    return null
  }
  private *walk(): Generator<FakeElement> {
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) {
        yield c
        yield* c.walk()
      }
    }
  }
  querySelector(sel: string) {
    for (const e of this.walk()) if (matches(e, sel)) return e
    return null
  }
  querySelectorAll(sel: string) {
    return [...this.walk()].filter((e) => matches(e, sel))
  }
  animate(keyframes: unknown) {
    animateLog.push({ el: this, keyframes })
    if (holdAnimations) {
      return { finished: new Promise<void>((r) => held.push(r)), cancel() {} }
    }
    return { finished: Promise.resolve(), cancel() {} }
  }
  getAnimations() {
    return this.running
  }
  /** Where a `fixed; inset: 0` child of this element lands on screen: set on
   *  a sheet to play desktop's translated dialog, which holds its fixed
   *  children (the probe beside a SheetLayer reads it). */
  fixedBox: { left: number; top: number; width: number; height: number } | null = null
  getBoundingClientRect() {
    if (/\bfixed\b/.test(this.className) || this.style.position === "fixed" || /position:fixed/.test(String(this.style.cssText ?? ""))) {
      for (let n: FakeNode | null = this.parentNode; n && n.nodeType === 1; n = n.parentNode) {
        const box = (n as FakeElement).fixedBox
        if (box) return { ...box, right: box.left + box.width, bottom: box.top + box.height }
      }
      return { top: 0, left: 0, right: WINDOW.width, bottom: WINDOW.height, width: WINDOW.width, height: WINDOW.height }
    }
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
}

class FakeDocument extends FakeNode {
  nodeType = 9
  nodeName = "#document"
  documentElement: FakeElement
  body: FakeElement
  head: FakeElement
  activeElement: FakeElement | null = null
  defaultView: unknown = null
  constructor() {
    super()
    this.documentElement = this.createElement("html")
    this.head = this.createElement("head")
    this.body = this.createElement("body")
    this.appendChild(this.documentElement)
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
    this.activeElement = this.body
  }
  createElement(tag: string) {
    const e = new FakeElement(tag)
    e.ownerDocument = this
    return e
  }
  createElementNS(_ns: string, tag: string) {
    return this.createElement(tag)
  }
  createTextNode(v: string) {
    const t = new FakeText(v)
    t.ownerDocument = this
    return t
  }
  createComment(v: string) {
    const t = new FakeText(v)
    t.nodeType = 8
    t.ownerDocument = this
    return t
  }
  querySelector(sel: string) {
    return this.documentElement.querySelector(sel)
  }
  querySelectorAll(sel: string) {
    return this.documentElement.querySelectorAll(sel)
  }
}

/** The window's own listeners (the pop-ups' capturing keydown). */
const windowListeners: Listener[] = []
/** A laptop window. */
const WINDOW = { width: 1440, height: 900 }

function installFakeDom(): FakeDocument {
  const document = new FakeDocument()
  class HTMLIFrameElement {}
  const win: Record<string, unknown> = {
    document,
    HTMLIFrameElement,
    Element: FakeElement,
    HTMLElement: FakeElement,
    Node: FakeNode,
    event: undefined,
    navigator: { userAgent: "node" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: WINDOW.width,
    innerHeight: WINDOW.height,
    addEventListener(type: string, fn: (e: unknown) => void, opts?: boolean | { capture?: boolean }) {
      const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture)
      windowListeners.push({ type, fn, capture })
    },
    removeEventListener(type: string, fn: (e: unknown) => void, opts?: boolean | { capture?: boolean }) {
      const capture = typeof opts === "boolean" ? opts : Boolean(opts?.capture)
      const i = windowListeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture)
      if (i >= 0) windowListeners.splice(i, 1)
    },
    getComputedStyle: () => ({ position: "static", opacity: "1" }),
    requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    setTimeout,
    clearTimeout,
  }
  document.defaultView = win
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = document
  g.HTMLIFrameElement = HTMLIFrameElement
  g.Element = FakeElement
  g.HTMLElement = FakeElement
  g.navigator ??= win.navigator
  g.IS_REACT_ACT_ENVIRONMENT = true
  g.CSS ??= { escape: (v: string) => v }
  g.requestAnimationFrame = win.requestAnimationFrame
  g.cancelAnimationFrame = win.cancelAnimationFrame
  g.getComputedStyle = win.getComputedStyle
  return document
}

/** A DOM event along the parent chain, capture then bubble (react-dom's root
 *  and portal listeners live on those nodes). */
function fire(el: FakeNode, type = "click", extra: Record<string, unknown> = {}) {
  const path: FakeNode[] = []
  for (let n: FakeNode | null = el; n; n = n.parentNode) path.push(n)
  const ev: Record<string, unknown> = {
    ...extra,
    type,
    target: el,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    isTrusted: true,
    timeStamp: Date.now(),
    detail: 1,
    button: 0,
    eventPhase: 0,
    _stop: false,
    preventDefault() {
      ev.defaultPrevented = true
    },
    stopPropagation() {
      ev._stop = true
    },
  }
  for (const node of [...path].reverse()) {
    ev.currentTarget = node
    for (const l of node.listeners.filter((x) => x.type === type && x.capture)) l.fn(ev)
    if (ev._stop) return ev
  }
  for (const node of path) {
    ev.currentTarget = node
    for (const l of node.listeners.filter((x) => x.type === type && !x.capture)) l.fn(ev)
    if (ev._stop) return ev
  }
  return ev
}

/** A key pressed while the window's capturing listeners are the first to hear it. */
function pressKey(key: string, shiftKey = false) {
  const ev = {
    key,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      ev.defaultPrevented = true
    },
    stopPropagation() {
      ev.stopped = true
    },
  }
  for (const l of windowListeners.filter((x) => x.type === "keydown" && x.capture)) l.fn(ev)
  return ev
}

/* --------------------------------------------------------------- setup --- */

let doc: FakeDocument
let React: typeof ReactNS
let createRoot: typeof ReactDomClient.createRoot
let PopDialog: typeof import("@/components/feel/PopDialog").PopDialog
let Toast: typeof import("@/components/feel/Toast").Toast
let FirstDoseModal: typeof import("@/components/home/FirstDoseModal").FirstDoseModal
let showToast: typeof import("@/lib/toast").showToast
let dismissToast: typeof import("@/lib/toast").dismissToast
let CloseArrow: typeof import("@/components/feel/CloseArrow").CloseArrow
let isOverSheet: typeof import("@/lib/feel/overlay").isOverSheet

beforeAll(async () => {
  doc = installFakeDom()
  React = await import("react")
  ;({ createRoot } = await import("react-dom/client"))
  ;({ PopDialog } = await import("@/components/feel/PopDialog"))
  ;({ Toast } = await import("@/components/feel/Toast"))
  ;({ FirstDoseModal } = await import("@/components/home/FirstDoseModal"))
  ;({ showToast, dismissToast } = await import("@/lib/toast"))
  ;({ CloseArrow } = await import("@/components/feel/CloseArrow"))
  ;({ isOverSheet } = await import("@/lib/feel/overlay"))
})

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  releaseAnimations()
  while (cleanups.length) await cleanups.pop()!()
  // Anything a test left on the page goes, so the next starts on a clean body.
  for (const c of [...doc.body.childNodes]) doc.body.removeChild(c)
  doc.activeElement = doc.body
})

const tick = () => new Promise((r) => setTimeout(r, 0))

/** A React root in `parent`, with a focused trigger beside it. */
function mount(parent: FakeElement) {
  const trigger = doc.createElement("button")
  parent.appendChild(trigger)
  const container = doc.createElement("div")
  parent.appendChild(container)
  trigger.focus()
  const root = createRoot(container as unknown as Element)
  const render = async (node: ReactNS.ReactNode) => {
    await React.act(async () => {
      root.render(node)
      await tick()
    })
  }
  cleanups.push(async () => {
    await React.act(async () => root.unmount())
  })
  return { trigger, container, render }
}

function openSheet(state: "open" | "closed" = "open") {
  const sheet = doc.createElement("div")
  sheet.setAttribute("data-slot", "sheet-content")
  sheet.setAttribute("data-state", state)
  doc.body.appendChild(sheet)
  return sheet
}

/** PopDialog's props less its children, which go in as createElement's rest. */
type PopProps = ReactNS.ComponentProps<typeof PopDialog>

const confirm = (open: boolean) =>
  React.createElement(
    PopDialog,
    { open, onClose: () => {}, title: "Delete this stack?", role: "alertdialog" } as PopProps,
    React.createElement("button", { type: "button" }, "Cancel"),
    React.createElement("button", { type: "button" }, "Delete stack"),
  )

/* --------------------------------------------------------------- tests --- */

describe("PopDialog: the first open is the same as every open (B9)", () => {
  for (const inSheet of [false, true]) {
    it(`scales in, moves focus in and gives it back, first time and every time (${inSheet ? "inside a sheet" : "on <body>"})`, async () => {
      const host = inSheet ? openSheet() : doc.body
      const t = mount(host)
      await t.render(confirm(false))

      for (const round of ["first", "second"]) {
        animateLog.length = 0
        await t.render(confirm(true))
        const card = doc.querySelector('[role="alertdialog"]')
        expect(card, round).not.toBeNull()
        if (inSheet) expect(host.contains(card), `${round}: renders inside the sheet`).toBe(true)
        expect(animateLog.some((a) => a.el === card), `${round}: scales in`).toBe(true)
        expect(doc.activeElement, `${round}: focus is on Cancel`).toBe(card!.querySelector("button"))

        await t.render(confirm(false))
        await t.render(confirm(false))
        expect(doc.querySelector('[role="alertdialog"]'), `${round}: gone`).toBeNull()
        expect(doc.activeElement, `${round}: focus is back on the trigger`).toBe(t.trigger)
      }
    })
  }

  it("a pop-up mounted already open (a conditional render) animates and takes focus", async () => {
    const t = mount(doc.body)
    animateLog.length = 0
    await t.render(
      React.createElement(
        PopDialog,
        { open: true, onClose: () => {}, title: "Reading the graph" } as PopProps,
        React.createElement("button", null, "Got it"),
      ),
    )
    const card = doc.querySelector('[role="dialog"]')
    expect(card).not.toBeNull()
    expect(animateLog.some((a) => a.el === card)).toBe(true)
    expect(doc.activeElement).toBe(card!.querySelector("button"))
  })
})

describe("PopDialog keeps Tab inside itself (B36)", () => {
  it("Tab and Shift+Tab walk its buttons and wrap, and the event stops there", async () => {
    const t = mount(doc.body)
    await t.render(confirm(false))
    await t.render(confirm(true))
    const [cancel, del] = doc.querySelector('[role="alertdialog"]')!.querySelectorAll("button")
    expect(doc.activeElement).toBe(cancel)

    let ev = pressKey("Tab")
    expect(doc.activeElement).toBe(del)
    expect(ev.defaultPrevented).toBe(true)
    // Stopped on the way down: a sheet's own trap underneath never sees it.
    expect(ev.stopped).toBe(true)

    pressKey("Tab")
    expect(doc.activeElement, "wraps to the first").toBe(cancel)

    ev = pressKey("Tab", true)
    expect(doc.activeElement, "Shift+Tab wraps to the last").toBe(del)
    expect(ev.defaultPrevented).toBe(true)
  })

  it("brings focus that has wandered behind the scrim back into the card", async () => {
    const t = mount(doc.body)
    await t.render(confirm(false))
    await t.render(confirm(true))
    t.trigger.focus()
    pressKey("Tab")
    expect(doc.activeElement).toBe(doc.querySelector('[role="alertdialog"]')!.querySelector("button"))
  })

  it("lets other keys through, and stops listening once it closes", async () => {
    const t = mount(doc.body)
    await t.render(confirm(false))
    await t.render(confirm(true))
    expect(pressKey("a").defaultPrevented).toBe(false)
    await t.render(confirm(false))
    await t.render(confirm(false))
    t.trigger.focus()
    expect(pressKey("Tab").defaultPrevented).toBe(false)
    expect(doc.activeElement).toBe(t.trigger)
  })
})

describe("the toast's Undo can be reached while a sheet is up (B10)", () => {
  const toastRegion = () => doc.querySelector("[data-toast]")

  it("lives in the app shell when no sheet is open", async () => {
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("Unticked", { undo: () => {} }))
    expect(t.container.contains(toastRegion())).toBe(true)
    await React.act(async () => dismissToast())
  })

  it("renders inside the top open sheet, Undo and all, above the sheet's content", async () => {
    const under = openSheet()
    const top = openSheet()
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("Discarded", { undo: () => {} }))
    const region = toastRegion()!
    expect(top.contains(region)).toBe(true)
    expect(under.contains(region)).toBe(false)
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.className).toContain("z-[70]")
    const undo = region.querySelector("button")!
    expect(undo.textContent).toBe("Undo")
    // Reachable by Tab inside the sheet's trap: it is a real, focusable button.
    undo.focus()
    expect(doc.activeElement).toBe(undo)
    await React.act(async () => dismissToast())
  })

  it("keeps the live region in the sheet while it is open, so the next toast is announced there", async () => {
    const sheet = openSheet()
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    expect(sheet.contains(toastRegion())).toBe(true)
    expect(t.container.contains(toastRegion())).toBe(false)
  })

  it("goes back to the shell as the sheet starts to close", async () => {
    const sheet = openSheet()
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("Saved"))
    expect(sheet.contains(toastRegion())).toBe(true)
    sheet.setAttribute("data-state", "closed")
    await React.act(async () => showToast("Saved"))
    expect(sheet.contains(toastRegion())).toBe(false)
    expect(t.container.contains(toastRegion())).toBe(true)
    await React.act(async () => dismissToast())
  })

  it("waits for a rising sheet to land, so it never rides the slide", async () => {
    const sheet = openSheet()
    sheet.running = [{}]
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("Unticked", { undo: () => {} }))
    expect(t.container.contains(toastRegion())).toBe(true)
    sheet.running = []
    await React.act(async () => showToast("Unticked", { undo: () => {} }))
    expect(sheet.contains(toastRegion())).toBe(true)
    await React.act(async () => dismissToast())
  })

  it("Undo still runs the toast's undo from inside the sheet", async () => {
    openSheet()
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    let undone = 0
    await React.act(async () => showToast("Discarded", { undo: () => (undone += 1) }))
    await React.act(async () => {
      fire(toastRegion()!.querySelector("button")!)
    })
    expect(undone).toBe(1)
    expect(toastRegion()!.textContent).toBe("")
  })
})

describe("First Dose Logged behaves like every pop-up (B36)", () => {
  const modal = (open: boolean, onClose = () => {}) => React.createElement(FirstDoseModal, { open, onClose })

  it("focuses Done, keeps Tab on it, takes taps over an open sheet, and gives focus back on close", async () => {
    const t = mount(doc.body)
    let closed = 0
    await t.render(modal(false))
    await t.render(modal(true, () => (closed += 1)))
    const dialog = doc.querySelector('[role="dialog"]')!
    const done = dialog.querySelector("button")!
    expect(done.textContent).toBe("Done")
    expect(doc.activeElement).toBe(done)
    // Its root takes the pointer back from a sheet's `pointer-events: none` body.
    expect((dialog.parentNode as FakeElement).className).toContain("pointer-events-auto")

    const ev = pressKey("Tab")
    expect(ev.defaultPrevented).toBe(true)
    expect(doc.activeElement).toBe(done)

    await React.act(async () => {
      fire(done)
      await tick()
    })
    expect(closed).toBe(1)
    expect(doc.activeElement).toBe(t.trigger)
  })

  it("Escape closes it and is stopped there, so a sheet underneath stays", async () => {
    const t = mount(doc.body)
    let closed = 0
    await t.render(modal(false))
    await t.render(modal(true, () => (closed += 1)))
    let ev: ReturnType<typeof pressKey> | null = null
    await React.act(async () => {
      ev = pressKey("Escape")
      await tick()
    })
    expect(ev!.stopped).toBe(true)
    expect(closed).toBe(1)
  })

  it("renders inside the top open sheet when one is up", async () => {
    const sheet = openSheet()
    const t = mount(doc.body)
    await t.render(modal(false))
    await t.render(modal(true))
    expect(sheet.contains(doc.querySelector('[role="dialog"]'))).toBe(true)
  })
})

/* ------------------------------------------------------------- round two --- */

describe("the toast inside a sheet, round two (B10)", () => {
  const toastRegion = () => doc.querySelector("[data-toast]")

  it("still sits at the foot of the WINDOW inside desktop's translated dialog", async () => {
    // A 544 × 400 dialog centred in a 1440 × 900 window: a fixed child of it
    // is placed against the dialog, from (448, 250).
    const dialog = openSheet()
    dialog.setAttribute("data-desktop", "dialog")
    dialog.fixedBox = { left: 448, top: 250, width: 544, height: 400 }
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("BPC-157 deleted", { undo: () => {} }))
    const frame = doc.querySelector("[data-sheet-layer]")!
    expect(dialog.contains(frame)).toBe(true)
    expect(frame.contains(toastRegion())).toBe(true)
    // The frame is moved back over the whole window...
    expect(frame.style.left).toBe("-448px")
    expect(frame.style.top).toBe("-250px")
    expect(frame.style.width).toBe("1440px")
    expect(frame.style.height).toBe("900px")
    // ...and is itself the box the toast's own `fixed` is placed against, so
    // the toast lands where it would on <body>. Above the sheet, taking no taps.
    expect(frame.className).toContain("[translate:0_0]")
    expect(frame.className).toContain("z-[70]")
    expect(frame.className).toContain("pointer-events-none")
    await React.act(async () => dismissToast())
  })

  it("does not move on a phone sheet, whose fixed children are already placed against the window", async () => {
    openSheet()
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    const frame = doc.querySelector("[data-sheet-layer]")!
    // Left as drawn (`inset: 0`): no size or place of its own.
    expect(frame.style.left).toBe("")
    expect(frame.style.top).toBe("")
    expect(frame.style.width).toBe("")
    // The throwaway window probe is gone again.
    expect(doc.body.childNodes.some((n) => (n as FakeElement).style?.cssText)).toBe(false)
  })

  it("Tab from Undo wraps to the sheet's first control, as the sheet's own trap would", async () => {
    const sheet = openSheet()
    const first = doc.createElement("button")
    sheet.appendChild(first)
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("Unticked", { undo: () => {} }))
    const undo = toastRegion()!.querySelector("button")!
    undo.focus()
    let ev: Record<string, unknown> = {}
    await React.act(async () => {
      ev = fire(undo, "keydown", { key: "Tab", shiftKey: false })
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(doc.activeElement).toBe(first)

    // Shift+Tab from Undo is the browser's own: back to the control before it.
    undo.focus()
    await React.act(async () => {
      ev = fire(undo, "keydown", { key: "Tab", shiftKey: true })
    })
    expect(ev.defaultPrevented).toBe(false)
    await React.act(async () => dismissToast())
  })

  it("a tap on Undo is not a tap outside the sheet, wherever the toast is", async () => {
    openSheet()
    const t = mount(doc.body)
    await t.render(React.createElement(Toast))
    await React.act(async () => showToast("Unticked", { undo: () => {} }))
    expect(isOverSheet(toastRegion()!.querySelector("button"))).toBe(true)
    await React.act(async () => dismissToast())
  })
})

describe("First Dose Logged over an open sheet, round two (B36)", () => {
  const modal = (open: boolean, onClose = () => {}) => React.createElement(FirstDoseModal, { open, onClose })

  it("a tap on Done or the dark is not a tap outside the sheet, so the sheet stays", async () => {
    const sheet = openSheet()
    const t = mount(doc.body)
    await t.render(modal(false))
    await t.render(modal(true))
    const dialog = doc.querySelector('[role="dialog"]')!
    expect(sheet.contains(dialog)).toBe(true)
    expect(isOverSheet(dialog.querySelector("button"))).toBe(true)
    const scrim = (dialog.parentNode as FakeElement).childNodes[0] as FakeElement
    expect(isOverSheet(scrim)).toBe(true)
  })

  it("covers the whole window from inside desktop's translated dialog", async () => {
    const sheet = openSheet()
    sheet.fixedBox = { left: 448, top: 250, width: 544, height: 400 }
    const t = mount(doc.body)
    await t.render(modal(false))
    await t.render(modal(true))
    const frame = doc.querySelector("[data-sheet-layer]")!
    expect(frame.contains(doc.querySelector('[role="dialog"]'))).toBe(true)
    expect(frame.style.left).toBe("-448px")
    expect(frame.className).toContain("z-[80]")
  })

  it("stays where it is while it fades out, even if the sheet under it starts to close", async () => {
    const sheet = openSheet()
    const t = mount(doc.body)
    await t.render(modal(false))
    await t.render(modal(true))
    const card = doc.querySelector('[role="dialog"]')!
    holdAnimations = true
    await React.act(async () => {
      fire(card.querySelector("button")!)
      await tick()
    })
    // Mid-fade the sheet starts to close; the card is not moved (and redrawn).
    sheet.setAttribute("data-state", "closed")
    await t.render(modal(false))
    expect(doc.querySelector('[role="dialog"]')).toBe(card)
    expect(sheet.contains(card)).toBe(true)
    await React.act(async () => {
      releaseAnimations()
      await tick()
    })
    expect(doc.querySelector('[role="dialog"]')).toBeNull()
  })

  it("while it is up and not closing, a sheet closing under it hands it to <body>, focus and all", async () => {
    const sheet = openSheet()
    const t = mount(doc.body)
    await t.render(modal(false))
    await t.render(modal(true))
    sheet.setAttribute("data-state", "closed")
    await t.render(modal(true))
    const card = doc.querySelector('[role="dialog"]')!
    expect(sheet.contains(card)).toBe(false)
    expect(doc.body.contains(card)).toBe(true)
    expect(doc.activeElement).toBe(card.querySelector("button"))
  })
})

describe("focus never stays on a close arrow as it hides (S4 round two)", () => {
  /** FlowRow's FoldArrow: the down arrow and the close arrow in one spot. */
  const Fold = ({ open, onToggle }: { open: boolean; onToggle: () => void }) =>
    React.createElement(
      "span",
      { "data-spot": "" },
      React.createElement("button", { type: "button", onClick: onToggle, tabIndex: open ? -1 : 0, "aria-label": "BPC-157" }),
      React.createElement(CloseArrow, { onClick: onToggle, label: "BPC-157", shown: open }),
    )
  const twinOf = () => doc.querySelector("[data-spot]")!.childNodes[0] as FakeElement
  const arrowOf = () => doc.querySelector("[data-shown]")!

  it("opening from the down arrow puts focus on the close arrow in its place; closing gives it back", async () => {
    const t = mount(doc.body)
    await t.render(React.createElement(Fold, { open: false, onToggle: () => {} }))
    twinOf().focus()
    await t.render(React.createElement(Fold, { open: true, onToggle: () => {} }))
    expect(doc.activeElement).toBe(arrowOf())

    await t.render(React.createElement(Fold, { open: false, onToggle: () => {} }))
    expect(doc.activeElement).toBe(twinOf())
    expect(arrowOf().getAttribute("aria-hidden")).toBe("true")
  })

  it("closing a panel from its arrow goes back to the tile that opened it", async () => {
    const Panel = ({ open }: { open: boolean }) =>
      React.createElement(
        "div",
        null,
        React.createElement("button", { type: "button", "data-tile": "" }, "Site"),
        React.createElement("div", { inert: open ? undefined : true }, React.createElement(CloseArrow, { onClick: () => {}, shown: open })),
        React.createElement("button", { type: "button" }, "Save"),
      )
    const t = mount(doc.body)
    await t.render(React.createElement(Panel, { open: false }))
    const tile = doc.querySelector("[data-tile]")!
    tile.focus()
    await t.render(React.createElement(Panel, { open: true }))
    arrowOf().focus()
    // Hidden from screen readers only AFTER focus has left it: never a focused
    // element under aria-hidden (Chrome blocks that and warns).
    let hiddenWhileFocused: string | null = "unset"
    arrowOf().addEventListener("focusout", () => (hiddenWhileFocused = arrowOf().getAttribute("aria-hidden")))
    await t.render(React.createElement(Panel, { open: false }))
    expect(hiddenWhileFocused).toBeNull()
    expect(doc.activeElement).toBe(tile)
    expect(arrowOf().getAttribute("aria-hidden")).toBe("true")
  })

  it("when what opened it is gone (the journal's reopen line), the next control takes focus", async () => {
    const Journal = ({ open }: { open: boolean }) =>
      React.createElement(
        "section",
        null,
        React.createElement("div", null, React.createElement(CloseArrow, { onClick: () => {}, label: "Close the journal", shown: open })),
        open ? null : React.createElement("button", { type: "button", "data-reopen": "" }, "How did today go?"),
      )
    const t = mount(doc.body)
    await t.render(React.createElement(Journal, { open: false }))
    doc.querySelector("[data-reopen]")!.focus()
    await t.render(React.createElement(Journal, { open: true }))
    arrowOf().focus()
    await t.render(React.createElement(Journal, { open: false }))
    expect(doc.activeElement).toBe(doc.querySelector("[data-reopen]"))
    expect(arrowOf().getAttribute("aria-hidden")).toBe("true")
  })

  it("keeps out of the accessibility tree only once focus has left it", async () => {
    // Nothing else on the page can take focus: it lets go of focus, and only
    // then is hidden.
    const t = mount(doc.body)
    t.trigger.setAttribute("tabindex", "-1")
    await t.render(React.createElement(CloseArrow, { onClick: () => {}, shown: true }))
    arrowOf().focus()
    await t.render(React.createElement(CloseArrow, { onClick: () => {}, shown: false }))
    expect(doc.activeElement).toBe(doc.body)
    expect(arrowOf().getAttribute("aria-hidden")).toBe("true")
  })

  it("leaves focus alone when it is elsewhere as the arrow hides (a tap, a click)", async () => {
    const t = mount(doc.body)
    await t.render(React.createElement(CloseArrow, { onClick: () => {}, shown: true }))
    t.trigger.focus()
    await t.render(React.createElement(CloseArrow, { onClick: () => {}, shown: false }))
    expect(doc.activeElement).toBe(t.trigger)
  })
})
