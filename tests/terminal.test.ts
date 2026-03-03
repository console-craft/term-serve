import { beforeEach, describe, expect, mock, test } from "bun:test"
import {
  CONTROL_CHARACTERS,
  CONTROL_SEQUENCES,
  getBanner,
  getDisconnectedMessage,
  getMotd,
  getRunningCommandMessage,
} from "@/lib/client/ansi"

type FakeButton = {
  classList: { contains: (name: string) => boolean }
}
type ToolbarClickEvent = { button?: FakeButton; preventDefault: () => void }
type Toolbar = {
  clickHandler?: (event: ToolbarClickEvent) => void
  addEventListener: (type: string, handler: (event: ToolbarClickEvent) => void) => void
}

type Orientation = "portrait" | "landscape"

type ResizeEventHandler = () => void
type DomEventHandler = (event: unknown) => void

class FakeElement {
  style: Record<string, string> = {}
  listeners = new Map<string, DomEventHandler[]>()
  private attributes = new Map<string, string>()
  private rect = { width: 0, height: 0, right: 0 }

  constructor(rect?: Partial<{ width: number; height: number; right: number }>) {
    if (rect) {
      this.rect = {
        ...this.rect,
        ...rect,
      }
    }
  }

  addEventListener(type: string, handler: DomEventHandler): void {
    const handlers = this.listeners.get(type) ?? []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }

  emit(type: string, event: unknown): void {
    const handlers = this.listeners.get(type)
    if (!handlers) return

    for (const handler of handlers) {
      handler(event)
    }
  }

  getBoundingClientRect(): DOMRect {
    return this.rect as unknown as DOMRect
  }

  setRect(rect: Partial<{ width: number; height: number; right: number }>): void {
    this.rect = {
      ...this.rect,
      ...rect,
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }
}

class FakeMouseEvent {
  clientX: number
  prevented = false
  stopped = false

  constructor(_type: string, init?: { clientX?: number }) {
    this.clientX = init?.clientX ?? 0
  }

  preventDefault(): void {
    this.prevented = true
  }

  stopPropagation(): void {
    this.stopped = true
  }
}

class FakeVisualViewport {
  height: number
  private resizeHandlers: ResizeEventHandler[] = []

  constructor(height: number) {
    this.height = height
  }

  addEventListener(type: string, handler: ResizeEventHandler): void {
    if (type === "resize") {
      this.resizeHandlers.push(handler)
    }
  }

  emitResize(): void {
    for (const handler of this.resizeHandlers) {
      handler()
    }
  }
}

type PointerLikeEvent = {
  pointerType: string
  isPrimary: boolean
  clientX: number
  preventDefault: () => void
  stopPropagation: () => void
}

function createPointerLikeEvent(overrides: Partial<PointerLikeEvent> = {}) {
  const state = { prevented: false, stopped: false }
  const event: PointerLikeEvent = {
    pointerType: "touch",
    isPrimary: true,
    clientX: 20,
    preventDefault() {
      state.prevented = true
    },
    stopPropagation() {
      state.stopped = true
    },
    ...overrides,
  }

  return { event, state }
}

let orientationFallback: Orientation = "portrait"
const orientationQueue: Orientation[] = []
let mockMobileWidth = true
let mockVirtualKeyboardVisible = false
let mockTouchCapableDevice = true
let mockInScrollGutter = false
let mockTerminalInputLocked = false
let mockKeyboardVisibleContentHeight = 0
let nowMs = 0

const viewportListeners: Array<(event: { target: unknown }) => void> = []
const getElementCalls: string[] = []
const focusCalls: unknown[] = []
const blurCalls: unknown[] = []

let terminalWindowElement = new FakeElement()
let terminalContentElement = new FakeElement({ width: 360, height: 700, right: 360 })

function createMobileTerm() {
  return {
    element: new FakeElement({ width: 360, height: 640, right: 360 }),
    textarea: new FakeElement(),
  }
}

function emitFocusIn(target: unknown): void {
  for (const listener of viewportListeners) {
    listener({ target })
  }
}

const statusCalls: Array<[string, string]> = []
const pressedCalls: Array<[string, boolean]> = []
const wsUrls: string[] = []
let toolbar: Toolbar

function createToolbar(): Toolbar {
  const nextToolbar: Toolbar = {
    clickHandler: undefined,
    addEventListener(type: string, handler: (event: ToolbarClickEvent) => void) {
      if (type === "click") nextToolbar.clickHandler = handler
    },
  }
  return nextToolbar
}
function createButton(classes: string[]): FakeButton {
  const classSet = new Set(classes)
  return {
    classList: {
      contains(name: string) {
        return classSet.has(name)
      },
    },
  }
}
function clickToolbar(button: FakeButton): void {
  toolbar.clickHandler?.({
    button,
    preventDefault() {},
  })
}

mock.module("@/lib/client/terminal-ui", () => ({
  SCROLL_GUTTER_WIDTH_PX: 28,
  setTitlebarAddress() {},
  setStatus(status: string, text: string) {
    statusCalls.push([status, text])
  },
  setButtonsPressedState(buttonClass: string, isPressed: boolean) {
    pressedCalls.push([buttonClass, isPressed])
  },
  focusTerminalInput(term: unknown) {
    focusCalls.push(term)
  },
  blurTerminalInput(term: unknown) {
    blurCalls.push(term)
  },
  setupToolbarTerminalFocus() {},
  getContentHeightWhenKeyboardIsVisible() {
    return mockKeyboardVisibleContentHeight
  },
  isInScrollGutter() {
    return mockInScrollGutter
  },
  isTerminalInputLocked() {
    return mockTerminalInputLocked
  },
  setupSwitchKeysButton() {},
}))

mock.module("@/lib/client/utils", () => ({
  getElement(selector: string) {
    getElementCalls.push(selector)

    if (selector === ".toolbar") return toolbar
    if (selector === ".terminal-window") return terminalWindowElement
    if (selector === ".terminal-content") return terminalContentElement

    throw new Error(`Missing ${selector}`)
  },
  getClickedButton(event: { button?: FakeButton }) {
    return event.button ?? null
  },
  hasMobileWidth() {
    return mockMobileWidth
  },
  getOrientation() {
    return orientationQueue.shift() ?? orientationFallback
  },
  isVirtualKeyboardVisible() {
    return mockVirtualKeyboardVisible
  },
  isTouchCapableDevice() {
    return mockTouchCapableDevice
  },
  dispatchWheelEvent() {},
  getOriginParts() {
    return { scheme: "http://", host: "term-serve.test", port: "" }
  },
  isNormalScreen(term: unknown) {
    const t = term as { buffer?: { active?: { type?: string } } }
    return t.buffer?.active?.type === "normal"
  },
  getSessionStorage() {
    return undefined
  },
}))
const { createSendKeysController } = await import("@/lib/client/key-sequences")
const { connect, handleSendNewSizeToServer, handleSendTerminalInputToServer, setupSendKeysButtonsToServer } =
  await import("@/lib/client/websockets")
const { handleMobileKeyboardToggle, handleViewportResize } = await import("@/lib/client/resize")

class FakeWebSocket {
  static OPEN = 1
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    wsUrls.push(url)
  }

  send(data: string): void {
    this.sent.push(data)
  }
}
function createTerminal(cols: number, rows: number) {
  const writes: string[] = []
  let onData: ((data: string) => void) | undefined
  let onResize: ((size: { cols: number; rows: number }) => void) | undefined

  const normalBuffer = {
    type: "normal",
    cursorX: 0,
    cursorY: 0,
    viewportY: 0,
    baseY: 0,
    length: rows,
    getLine() {
      return undefined
    },
    getNullCell() {
      return {
        getChars() {
          return ""
        },
      } as never
    },
  }
  const alternateBuffer = {
    ...normalBuffer,
    type: "alternate",
  }

  return {
    cols,
    rows,
    writes,
    buffer: {
      active: normalBuffer,
      normal: normalBuffer,
      alternate: alternateBuffer,
      onBufferChange() {
        return { dispose() {} }
      },
    },
    write(data: string) {
      writes.push(data)
    },
    onData(handler: (data: string) => void) {
      onData = handler
    },
    onResize(handler: (size: { cols: number; rows: number }) => void) {
      onResize = handler
    },
    emitData(data: string) {
      onData?.(data)
    },
    emitResize(nextCols: number, nextRows: number) {
      onResize?.({ cols: nextCols, rows: nextRows })
    },
  }
}

beforeEach(() => {
  statusCalls.length = 0
  pressedCalls.length = 0
  wsUrls.length = 0
  getElementCalls.length = 0
  focusCalls.length = 0
  blurCalls.length = 0
  viewportListeners.length = 0
  orientationQueue.length = 0

  orientationFallback = "portrait"
  mockMobileWidth = true
  mockVirtualKeyboardVisible = false
  mockTouchCapableDevice = true
  mockInScrollGutter = false
  mockTerminalInputLocked = false
  mockKeyboardVisibleContentHeight = 0
  nowMs = 0

  toolbar = createToolbar()
  terminalWindowElement = new FakeElement()
  terminalContentElement = new FakeElement({ width: 360, height: 700, right: 360 })

  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  globalThis.location = { protocol: "http:", host: "term-serve.test" } as Location
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement
  globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent
  globalThis.document = {
    activeElement: null,
    addEventListener(type: string, handler: (event: { target: unknown }) => void) {
      if (type === "focusin") {
        viewportListeners.push(handler)
      }
    },
  } as unknown as Document
  globalThis.window = {
    innerHeight: 800,
    visualViewport: undefined,
    confirm() {
      return true
    },
  } as unknown as Window & typeof globalThis
  ;(globalThis as { performance: { now: () => number } }).performance = {
    now() {
      return nowMs
    },
  }
})

describe("client websockets", () => {
  test("connect() selects ws/wss from page protocol", () => {
    connect(createTerminal(80, 24) as never)
    expect(wsUrls[0]).toBe("ws://term-serve.test/ws?cols=80&rows=24")

    globalThis.location = { protocol: "https:", host: "secure.term-serve.test" } as Location
    connect(createTerminal(120, 40) as never)
    expect(wsUrls[1]).toBe("wss://secure.term-serve.test/ws?cols=120&rows=40")
  })

  test("connect() writes banner/MOTD and handles socket lifecycle", () => {
    const term = createTerminal(80, 24)
    const [, rawWs] = connect(term as never)
    const ws = rawWs as unknown as FakeWebSocket

    expect(term.writes).toEqual([getBanner(), getMotd()])
    ws.onopen?.()
    expect(statusCalls).toContainEqual(["connected", "Connected"])

    ws.onclose?.()
    expect(statusCalls).toContainEqual(["disconnected", "Disconnected"])
    expect(term.writes[2]).toBe(getDisconnectedMessage())
  })

  test("connect() writes banner + running command message in command mode", () => {
    const term = createTerminal(80, 24)
    connect(term as never, { ptyMode: "command", ptyCommand: "sleep 1" })

    expect(term.writes).toEqual([getBanner(), getRunningCommandMessage(undefined, "sleep 1")])
  })

  test("connect() writes incoming server data", () => {
    const term = createTerminal(80, 24)
    const [, rawWs] = connect(term as never)
    const ws = rawWs as unknown as FakeWebSocket

    ws.onmessage?.({ data: "$ pwd\r\n/home/ovi" })
    expect(term.writes[2]).toBe("$ pwd\r\n/home/ovi")
  })

  test("setupSendKeysButtonsToServer sends only when websocket is OPEN", () => {
    const ws = new FakeWebSocket("ws://local")
    setupSendKeysButtonsToServer(ws as unknown as WebSocket, createTerminal(80, 24) as never)

    clickToolbar(createButton(["tab-button"]))
    expect(ws.sent).toEqual([])

    ws.readyState = FakeWebSocket.OPEN
    clickToolbar(createButton(["tab-button"]))
    expect(ws.sent).toEqual([CONTROL_CHARACTERS.tab])
  })

  test("handleSendTerminalInputToServer + handleSendNewSizeToServer gate on OPEN", () => {
    const ws = new FakeWebSocket("ws://local")
    const term = createTerminal(80, 24)
    const sendKeys = { parseInput: (input: string) => `parsed:${input}` }

    handleSendTerminalInputToServer(ws as unknown as WebSocket, term as never, sendKeys)
    handleSendNewSizeToServer(ws as unknown as WebSocket, term as never)

    term.emitData("ls")
    term.emitResize(100, 35)
    expect(ws.sent).toEqual([])

    ws.readyState = FakeWebSocket.OPEN
    term.emitData("pwd")
    term.emitResize(101, 36)
    expect(ws.sent).toEqual(["parsed:pwd", JSON.stringify({ type: "resize", cols: 101, rows: 36 })])
  })

  test("typing exit + Enter prompts and can cancel sending Enter", () => {
    const ws = new FakeWebSocket("ws://local")
    ws.readyState = FakeWebSocket.OPEN

    const term = createTerminal(80, 24)
    const sendKeys = { parseInput: (input: string) => input }

    const confirmCalls: string[] = []
    ;(globalThis.window as unknown as { confirm: (msg: string) => boolean }).confirm = (msg: string) => {
      confirmCalls.push(msg)
      return false
    }

    handleSendTerminalInputToServer(ws as unknown as WebSocket, term as never, sendKeys)

    term.emitData("exit")
    term.emitData("\r")

    expect(confirmCalls.length).toBe(1)
    expect(ws.sent).toEqual(["exit"])
  })

  test("Ctrl+D prompts only on normal screen + empty line", () => {
    const ws = new FakeWebSocket("ws://local")
    ws.readyState = FakeWebSocket.OPEN

    const term = createTerminal(80, 24)
    const sendKeys = { parseInput: (input: string) => input }

    const confirmCalls: string[] = []
    ;(globalThis.window as unknown as { confirm: (msg: string) => boolean }).confirm = (msg: string) => {
      confirmCalls.push(msg)
      return false
    }

    handleSendTerminalInputToServer(ws as unknown as WebSocket, term as never, sendKeys)
    term.emitData("\x04")

    expect(confirmCalls.length).toBe(1)
    expect(ws.sent).toEqual([])
  })
})

describe("send-keys controller", () => {
  test("sticky Ctrl applies once to typed input", () => {
    const controller = createSendKeysController(() => {})

    clickToolbar(createButton(["ctrl-button"]))
    expect(controller.parseInput("c")).toBe(CONTROL_CHARACTERS.ctrlC)
    expect(controller.parseInput("c")).toBe("c")
  })

  test("sticky Alt prefixes ESC once and clears after toolbar send", () => {
    const sent: string[] = []
    createSendKeysController((input) => sent.push(input))

    clickToolbar(createButton(["alt-button"]))
    clickToolbar(createButton(["right-arrow-button"]))
    clickToolbar(createButton(["right-arrow-button"]))

    expect(sent).toEqual([
      `${CONTROL_CHARACTERS.escape}${CONTROL_SEQUENCES.cursorRight}`,
      CONTROL_SEQUENCES.cursorRight,
    ])
    expect(pressedCalls).toContainEqual(["alt-button", false])
  })

  test("Ctrl+Alt modifier order applies as ESC + control-char then clears", () => {
    const controller = createSendKeysController(() => {})

    clickToolbar(createButton(["ctrl-button"]))
    clickToolbar(createButton(["alt-button"]))
    expect(controller.parseInput("x")).toBe(`${CONTROL_CHARACTERS.escape}${String.fromCharCode(24)}`)
    expect(controller.parseInput("x")).toBe("x")
  })
})

describe("mobile OSK + viewport resize", () => {
  test("handleViewportResize() returns early without visualViewport", () => {
    handleViewportResize()

    expect(getElementCalls).toEqual([])
  })

  test("viewport resize on mobile width sets terminal window height", () => {
    const viewport = new FakeVisualViewport(600)
    ;(globalThis.window as unknown as { visualViewport: VisualViewport }).visualViewport =
      viewport as unknown as VisualViewport

    handleViewportResize()
    viewport.emitResize()

    expect(terminalWindowElement.style.height).toBe("600px")
  })

  test("OSK shown sets terminal content height to keyboard-safe height", () => {
    const viewport = new FakeVisualViewport(650)
    ;(globalThis.window as unknown as { visualViewport: VisualViewport }).visualViewport =
      viewport as unknown as VisualViewport
    mockVirtualKeyboardVisible = true
    mockKeyboardVisibleContentHeight = 500

    handleViewportResize()
    viewport.emitResize()

    expect(terminalWindowElement.style.height).toBe("650px")
    expect(terminalContentElement.style.height).toBe("500px")
  })

  test("OSK hidden restores original terminal content height per orientation", () => {
    const viewport = new FakeVisualViewport(700)
    ;(globalThis.window as unknown as { visualViewport: VisualViewport }).visualViewport =
      viewport as unknown as VisualViewport
    mockVirtualKeyboardVisible = false

    handleViewportResize()

    orientationQueue.push("portrait")
    terminalContentElement.setRect({ height: 700 })
    viewport.emitResize()
    expect(terminalContentElement.style.height).toBe("700px")

    orientationQueue.push("landscape")
    terminalContentElement.setRect({ height: 320 })
    viewport.emitResize()
    expect(terminalContentElement.style.height).toBe("320px")

    orientationQueue.push("portrait")
    terminalContentElement.setRect({ height: 410 })
    viewport.emitResize()
    expect(terminalContentElement.style.height).toBe("700px")
  })

  test("originalHeight is captured once per orientation", () => {
    const viewport = new FakeVisualViewport(700)
    ;(globalThis.window as unknown as { visualViewport: VisualViewport }).visualViewport =
      viewport as unknown as VisualViewport
    mockVirtualKeyboardVisible = false

    handleViewportResize()

    orientationQueue.push("portrait")
    terminalContentElement.setRect({ height: 700 })
    viewport.emitResize()
    expect(terminalContentElement.style.height).toBe("700px")

    orientationQueue.push("portrait")
    terminalContentElement.setRect({ height: 650 })
    viewport.emitResize()
    expect(terminalContentElement.style.height).toBe("700px")
  })

  test("desktop width does not mutate inline heights", () => {
    const viewport = new FakeVisualViewport(700)
    ;(globalThis.window as unknown as { visualViewport: VisualViewport }).visualViewport =
      viewport as unknown as VisualViewport
    mockMobileWidth = false
    terminalWindowElement.style.height = "unchanged-window"
    terminalContentElement.style.height = "unchanged-content"

    handleViewportResize()
    viewport.emitResize()

    expect(terminalWindowElement.style.height).toBe("unchanged-window")
    expect(terminalContentElement.style.height).toBe("unchanged-content")
  })

  test("handleMobileKeyboardToggle() does nothing on non-touch-capable devices", () => {
    mockTouchCapableDevice = false
    const term = createMobileTerm()

    handleMobileKeyboardToggle(term as never)

    expect(term.element.listeners.size).toBe(0)
    expect(viewportListeners.length).toBe(0)
  })

  test("touch pointerdown focuses when terminal input is not focused", () => {
    const term = createMobileTerm()
    ;(globalThis.document as unknown as { activeElement: unknown }).activeElement = null

    handleMobileKeyboardToggle(term as never)

    const { event } = createPointerLikeEvent()
    term.element.emit("pointerdown", event)

    expect(focusCalls).toEqual([term])
    expect(blurCalls).toEqual([])
  })

  test("touch pointerdown blurs focused input and suppresses follow-up events", () => {
    const term = createMobileTerm()
    ;(globalThis.document as unknown as { activeElement: unknown }).activeElement = term.textarea

    handleMobileKeyboardToggle(term as never)

    const down = createPointerLikeEvent()
    term.element.emit("pointerdown", down.event)
    expect(down.state.prevented).toBe(true)
    expect(down.state.stopped).toBe(true)
    expect(blurCalls).toEqual([term])

    nowMs = 100
    const upSuppressed = createPointerLikeEvent()
    term.element.emit("pointerup", upSuppressed.event)
    expect(upSuppressed.state.prevented).toBe(true)
    expect(upSuppressed.state.stopped).toBe(true)

    const clickSuppressed = new FakeMouseEvent("click", { clientX: 12 })
    term.element.emit("click", clickSuppressed as unknown as MouseEvent)
    expect(clickSuppressed.prevented).toBe(true)
    expect(clickSuppressed.stopped).toBe(true)

    nowMs = 901
    const upAfterWindow = createPointerLikeEvent()
    term.element.emit("pointerup", upAfterWindow.event)
    expect(upAfterWindow.state.prevented).toBe(false)
    expect(upAfterWindow.state.stopped).toBe(false)

    const clickAfterWindow = new FakeMouseEvent("click", { clientX: 12 })
    term.element.emit("click", clickAfterWindow as unknown as MouseEvent)
    expect(clickAfterWindow.prevented).toBe(false)
    expect(clickAfterWindow.stopped).toBe(false)
  })

  test("pointerdown never toggles OSK from scroll gutter or locked input", () => {
    const term = createMobileTerm()
    handleMobileKeyboardToggle(term as never)

    mockInScrollGutter = true
    const fromGutter = createPointerLikeEvent({ clientX: 359 })
    term.element.emit("pointerdown", fromGutter.event)

    mockInScrollGutter = false
    mockTerminalInputLocked = true
    const whileLocked = createPointerLikeEvent({ clientX: 20 })
    term.element.emit("pointerdown", whileLocked.event)

    expect(focusCalls).toEqual([])
    expect(blurCalls).toEqual([])
  })

  test("pointerdown ignores non-touch and non-primary pointers", () => {
    const term = createMobileTerm()
    handleMobileKeyboardToggle(term as never)

    const mousePointer = createPointerLikeEvent({ pointerType: "mouse" })
    term.element.emit("pointerdown", mousePointer.event)

    const nonPrimaryTouch = createPointerLikeEvent({ pointerType: "touch", isPrimary: false })
    term.element.emit("pointerdown", nonPrimaryTouch.event)

    expect(focusCalls).toEqual([])
    expect(blurCalls).toEqual([])
  })

  test("focusin on textarea during suppression immediately blurs again", () => {
    const term = createMobileTerm()
    ;(globalThis.document as unknown as { activeElement: unknown }).activeElement = term.textarea

    handleMobileKeyboardToggle(term as never)

    const down = createPointerLikeEvent()
    term.element.emit("pointerdown", down.event)
    expect(blurCalls).toEqual([term])

    nowMs = 300
    emitFocusIn(term.textarea)
    expect(blurCalls).toEqual([term, term])
  })
})
