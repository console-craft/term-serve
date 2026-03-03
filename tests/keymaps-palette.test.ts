import { beforeEach, describe, expect, mock, test } from "bun:test"
import { CONTROL_CHARACTERS, CONTROL_SEQUENCES } from "@/lib/client/ansi"
import { KEYMAPS, translateKeymaps } from "@/lib/client/keymaps-palette"

type EventHandler = (event: unknown) => void

class FakeClassList {
  private values = new Set<string>()

  add(name: string): void {
    this.values.add(name)
  }

  remove(name: string): void {
    this.values.delete(name)
  }

  contains(name: string): boolean {
    return this.values.has(name)
  }

  toggle(name: string, force?: boolean): void {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name)
      else this.values.add(name)
      return
    }

    if (force) this.values.add(name)
    else this.values.delete(name)
  }
}

class FakeDocumentFragment {
  readonly isFragment = true
  readonly children: FakeElement[] = []

  appendChild(child: FakeElement): void {
    this.children.push(child)
  }
}

class FakeElement {
  className = ""
  classList = new FakeClassList()
  dataset: Record<string, string> = {}
  type = ""
  value = ""
  focused = false
  children: FakeElement[] = []
  listeners = new Map<string, EventHandler[]>()
  private text = ""

  get textContent(): string {
    return this.text
  }

  set textContent(value: string) {
    this.text = value
    if (value === "") {
      this.children = []
    }
  }

  addEventListener(type: string, handler: EventHandler): void {
    const handlers = this.listeners.get(type) ?? []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      this.children.push(node)
    }
  }

  appendChild(node: FakeElement | FakeDocumentFragment): void {
    if (node instanceof FakeDocumentFragment) {
      this.children.push(...node.children)
      return
    }

    this.children.push(node)
  }

  focus(): void {
    this.focused = true
  }

  emit(type: string, event: unknown): void {
    const handlers = this.listeners.get(type)
    if (!handlers) return

    for (const handler of handlers) {
      handler(event)
    }
  }
}

type KeydownEvent = {
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  key: string
  code: string
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation: () => void
}

const elementsBySelector = new Map<string, FakeElement>()
const documentHandlers = new Map<string, EventHandler[]>()
const focusedTerms: unknown[] = []

mock.module("@/lib/client/utils", () => ({
  getElement(selector: string) {
    const element = elementsBySelector.get(selector)
    if (!element) throw new Error(`Missing ${selector}`)
    return element
  },
  getClickedButton(event: { button?: FakeElement }) {
    return event.button ?? null
  },
  // Provide full surface area because mocks are global across test files.
  hasMobileWidth() {
    return false
  },
  getOrientation() {
    return "portrait" as const
  },
  isVirtualKeyboardVisible() {
    return false
  },
  isTouchCapableDevice() {
    return false
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

mock.module("@/lib/client/terminal-ui", () => ({
  focusTerminalInput(term: unknown) {
    focusedTerms.push(term)
  },
}))

const { setupKeymapsPalette } = await import("@/lib/client/keymaps-palette-ui")

function installDocument(): void {
  documentHandlers.clear()

  globalThis.document = {
    addEventListener(type: string, handler: EventHandler) {
      const handlers = documentHandlers.get(type) ?? []
      handlers.push(handler)
      documentHandlers.set(type, handlers)
    },
    createDocumentFragment() {
      return new FakeDocumentFragment()
    },
    createElement() {
      return new FakeElement()
    },
  } as unknown as Document
}

function emitDocument(type: string, event: unknown): void {
  const handlers = documentHandlers.get(type)
  if (!handlers) return

  for (const handler of handlers) {
    handler(event)
  }
}

function createKeydownEvent(overrides: Partial<KeydownEvent>): KeydownEvent & { blocked: boolean } {
  const state = { blocked: false }

  return {
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    key: "",
    code: "",
    preventDefault() {
      state.blocked = true
    },
    stopPropagation() {
      state.blocked = true
    },
    stopImmediatePropagation() {
      state.blocked = true
    },
    ...overrides,
    get blocked() {
      return state.blocked
    },
  }
}

function getRenderedButtons(list: FakeElement): FakeElement[] {
  return list.children.map((row) => row.children[0]).filter((button): button is FakeElement => button !== undefined)
}

function setupPaletteHarness() {
  const openButton = new FakeElement()
  const modal = new FakeElement()
  modal.classList.add("hidden")
  const input = new FakeElement()
  const list = new FakeElement()
  const empty = new FakeElement()
  empty.classList.add("hidden")
  const sent: string[] = []
  const term = { id: "terminal" }

  elementsBySelector.clear()
  elementsBySelector.set(".keymaps-palette-button", openButton)
  elementsBySelector.set(".keymaps-palette", modal)
  elementsBySelector.set(".keymaps-palette-input", input)
  elementsBySelector.set(".keymaps-palette-list", list)
  elementsBySelector.set(".keymaps-palette-empty", empty)

  setupKeymapsPalette(term as never, (sequence) => sent.push(sequence))

  return {
    openButton,
    modal,
    input,
    list,
    empty,
    sent,
    term,
  }
}

beforeEach(() => {
  focusedTerms.length = 0
  installDocument()
})

describe("translateKeymaps", () => {
  test("translates common palette sequences with ctrl/alt modifiers", () => {
    expect(translateKeymaps("Ctrl+C")).toBe(CONTROL_CHARACTERS.ctrlC)
    expect(translateKeymaps("Alt+Tab")).toBe(`${CONTROL_CHARACTERS.escape}${CONTROL_CHARACTERS.tab}`)
    expect(translateKeymaps("Alt+Ctrl+X")).toBe(`${CONTROL_CHARACTERS.escape}${String.fromCharCode(24)}`)
    expect(translateKeymaps("Right")).toBe(CONTROL_SEQUENCES.cursorRight)
    expect(translateKeymaps("Ctrl+Shift+P")).toBe(CONTROL_CHARACTERS.ctrlP)
    expect(translateKeymaps("Ctrl+")).toBe(null)
  })
})

describe("setupKeymapsPalette", () => {
  test("opens from Ctrl+Alt+K and renders the full list", () => {
    const { modal, input, list, empty } = setupPaletteHarness()
    input.value = "stale query"

    const event = createKeydownEvent({ ctrlKey: true, altKey: true, key: "k", code: "KeyK" })
    emitDocument("keydown", event)

    expect(event.blocked).toBe(true)
    expect(modal.classList.contains("hidden")).toBe(false)
    expect(input.value).toBe("")
    expect(input.focused).toBe(true)
    expect(getRenderedButtons(list).length).toBe(KEYMAPS.length)
    expect(empty.classList.contains("hidden")).toBe(true)
  })

  test("filters by description text and shows empty state", () => {
    const { openButton, input, list, empty } = setupPaletteHarness()

    openButton.emit("click", { preventDefault() {} })

    input.value = "autocomplete"
    input.emit("input", {})
    const autocompleteKeys = getRenderedButtons(list).map((button) => button.dataset.sequence)
    expect(autocompleteKeys).toEqual(["Tab", "Ctrl+J"])
    expect(empty.classList.contains("hidden")).toBe(true)

    input.value = "definitely-missing"
    input.emit("input", {})
    expect(getRenderedButtons(list)).toEqual([])
    expect(empty.classList.contains("hidden")).toBe(false)
  })

  test("clicking a palette item sends translated input and closes the modal", () => {
    const { openButton, list, modal, sent, term } = setupPaletteHarness()

    openButton.emit("click", { preventDefault() {} })
    const ctrlCButton = getRenderedButtons(list).find((button) => button.dataset.sequence === "Ctrl+C")

    list.emit("click", { button: ctrlCButton })

    expect(sent).toEqual([CONTROL_CHARACTERS.ctrlC])
    expect(modal.classList.contains("hidden")).toBe(true)
    expect(focusedTerms).toEqual([term])
  })

  test("supports Escape and Ctrl+C as close shortcuts when open", () => {
    const { openButton, modal, term } = setupPaletteHarness()
    openButton.emit("click", { preventDefault() {} })

    const escapeEvent = createKeydownEvent({ key: "Escape", code: "Escape" })
    emitDocument("keydown", escapeEvent)

    expect(escapeEvent.blocked).toBe(true)
    expect(modal.classList.contains("hidden")).toBe(true)
    expect(focusedTerms).toEqual([term])

    const closedCtrlC = createKeydownEvent({ ctrlKey: true, key: "c", code: "KeyC" })
    emitDocument("keydown", closedCtrlC)
    expect(closedCtrlC.blocked).toBe(false)

    openButton.emit("click", { preventDefault() {} })
    const openCtrlC = createKeydownEvent({ ctrlKey: true, key: "c", code: "KeyC" })
    emitDocument("keydown", openCtrlC)

    expect(openCtrlC.blocked).toBe(true)
    expect(modal.classList.contains("hidden")).toBe(true)
    expect(focusedTerms).toEqual([term, term])
  })
})
