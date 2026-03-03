import { beforeEach, describe, expect, mock, test } from "bun:test"
import { SelectionManager } from "ghostty-web"
import { copyCurrentSelection, copyTextToClipboard, pasteFromClipboard } from "@/lib/client/clipboard/clipboard"
import { setToolbarButtonsState, showHintOncePerSession } from "@/lib/client/clipboard/mobile-selection-ui"

type FakeToolbarButton = {
  disabled: boolean
  classList: { contains: (name: string) => boolean }
}

type FakeToolbarEvent = {
  button?: FakeToolbarButton
  preventDefault: () => void
  stopPropagation: () => void
}

type FakeToolbar = {
  clickHandler?: (event: FakeToolbarEvent) => void
  addEventListener: (type: string, handler: (event: FakeToolbarEvent) => void, options?: unknown) => void
}

type FakeSelectionSetup = {
  onCopySelection: (text: string) => Promise<boolean>
}

let alerts: string[] = []
let promptCalls: string[] = []
let activeToolbar: FakeToolbar
let mobileLayout = false
let capturedSelectionSetup: FakeSelectionSetup | undefined

function createToolbarButton(classes: string[], disabled = false): FakeToolbarButton {
  const classSet = new Set(classes)

  return {
    disabled,
    classList: {
      contains(name: string) {
        return classSet.has(name)
      },
    },
  }
}

function createToolbar(): FakeToolbar {
  return {
    addEventListener(type, handler) {
      if (type === "click") this.clickHandler = handler
    },
  }
}

function clickToolbar(button: FakeToolbarButton): void {
  activeToolbar.clickHandler?.({
    button,
    preventDefault() {},
    stopPropagation() {},
  })
}

function installDocument(
  execCommandResult: boolean,
  throwOnExec = false,
): { execCalls: string[]; removed: () => boolean } {
  const execCalls: string[] = []
  let removed = false

  globalThis.document = {
    body: {
      append() {},
    },
    createElement() {
      return {
        value: "",
        style: {} as Record<string, string>,
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
        remove() {
          removed = true
        },
      }
    },
    execCommand(command: string) {
      execCalls.push(command)
      if (throwOnExec) throw new Error("execCommand failed")
      return execCommandResult
    },
  } as unknown as Document

  return {
    execCalls,
    removed: () => removed,
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

type SelectionManagerFixtureOpts = {
  cols?: number
  rows?: number
  scrollback?: number
  viewportY?: number
}

function installSelectionTestDocument(): void {
  globalThis.document = {
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
    execCommand() {
      return true
    },
  } as unknown as Document
}

function createSelectionCanvas(cols: number, rows: number): HTMLCanvasElement {
  return {
    clientHeight: rows * 20,
    parentElement: {
      focus() {},
    },
    addEventListener() {},
    removeEventListener() {},
    contains() {
      return false
    },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: cols * 10,
        bottom: rows * 20,
      }
    },
  } as unknown as HTMLCanvasElement
}

function createSelectionRenderer(canvas: HTMLCanvasElement): {
  getCanvas: () => HTMLCanvasElement
  getMetrics: () => { width: number; height: number; baseline: number }
} {
  return {
    getCanvas() {
      return canvas
    },
    getMetrics() {
      return {
        width: 10,
        height: 20,
        baseline: 16,
      }
    },
  }
}

function createSelectionManagerFixture(opts: SelectionManagerFixtureOpts = {}): SelectionManager {
  const cols = opts.cols ?? 80
  const rows = opts.rows ?? 24
  const scrollback = opts.scrollback ?? 200
  const viewportY = opts.viewportY ?? 0

  installSelectionTestDocument()
  const canvas = createSelectionCanvas(cols, rows)
  const renderer = createSelectionRenderer(canvas)

  const terminal = {
    cols,
    rows,
    viewportY,
    getViewportY() {
      return viewportY
    },
    scrollLines() {},
  }

  const wasmTerm = {
    getDimensions() {
      return { cols, rows }
    },
    getScrollbackLength() {
      return scrollback
    },
  }

  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    focus() {},
    select() {},
    setSelectionRange() {},
  }

  return new SelectionManager(terminal as never, renderer as never, wasmTerm as never, textarea as never)
}

mock.module("@/lib/client/utils", () => ({
  getElement(selector: string) {
    if (selector !== ".toolbar") throw new Error(`Missing ${selector}`)
    return activeToolbar
  },
  getClickedButton(event: FakeToolbarEvent) {
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

mock.module("@/lib/client/clipboard/mobile-selection", () => ({
  setupMobileSelectionMode(opts: FakeSelectionSetup) {
    capturedSelectionSetup = opts
  },
}))

const { setupCopyButtons } = await import("@/lib/client/clipboard/index")

beforeEach(() => {
  alerts = []
  promptCalls = []
  activeToolbar = createToolbar()
  mobileLayout = false
  capturedSelectionSetup = undefined

  globalThis.alert = ((message: string) => {
    alerts.push(message)
  }) as typeof alert

  globalThis.window = {
    location: { origin: "https://term-serve.test" },
    isSecureContext: true,
    matchMedia: () => ({ matches: mobileLayout }),
    prompt(message: string) {
      promptCalls.push(message)
      return null
    },
  } as unknown as Window & typeof globalThis
})

describe("clipboard core behavior", () => {
  test("copyTextToClipboard uses navigator.clipboard.writeText when available", async () => {
    const writes: string[] = []
    globalThis.navigator = {
      clipboard: {
        async writeText(text: string) {
          writes.push(text)
        },
      },
    } as Navigator

    const result = await copyTextToClipboard("hello", "with-text")

    expect(result).toBe(true)
    expect(writes).toEqual(["hello"])
    expect(alerts[0]).toContain("Copied to clipboard")
    expect(alerts[0]).toContain("hello")
  })

  test("copyTextToClipboard falls back to execCommand when Clipboard API is missing", async () => {
    const doc = installDocument(true)
    globalThis.navigator = {} as Navigator

    const result = await copyTextToClipboard("fallback", "generic")

    expect(result).toBe(true)
    expect(doc.execCalls).toEqual(["copy"])
    expect(doc.removed()).toBe(true)
    expect(alerts).toEqual(["Copied to clipboard"])
  })

  test("copyTextToClipboard falls back to execCommand when writeText throws", async () => {
    const doc = installDocument(true)
    globalThis.navigator = {
      clipboard: {
        async writeText() {
          throw new Error("denied")
        },
      },
    } as unknown as Navigator

    const result = await copyTextToClipboard("recover", "generic")

    expect(result).toBe(true)
    expect(doc.execCalls).toEqual(["copy"])
    expect(alerts).toEqual(["Copied to clipboard"])
  })

  test("copyTextToClipboard returns false when both clipboard paths fail", async () => {
    installDocument(false, true)
    globalThis.navigator = {
      clipboard: {
        async writeText() {
          throw new Error("blocked")
        },
      },
    } as unknown as Navigator

    const result = await copyTextToClipboard("cannot-copy", "generic")

    expect(result).toBe(false)
    expect(alerts).toEqual(["Copy failed"])
  })

  test("copyTextToClipboard returns false for empty text", async () => {
    globalThis.navigator = {
      clipboard: {
        async writeText() {
          throw new Error("should not run")
        },
      },
    } as unknown as Navigator

    expect(await copyTextToClipboard("", "generic")).toBe(false)
    expect(alerts).toEqual([])
  })

  test("copyCurrentSelection always clears selection", async () => {
    const clearCalls: number[] = []
    const term = {
      getSelection: () => "selected-text",
      clearSelection() {
        clearCalls.push(1)
      },
    }

    globalThis.navigator = {
      clipboard: {
        async writeText() {
          throw new Error("blocked")
        },
      },
    } as unknown as Navigator
    installDocument(false)

    const result = await copyCurrentSelection(term as never, "generic")

    expect(result).toBe(false)
    expect(clearCalls.length).toBe(1)
  })

  test("pasteFromClipboard reads clipboard and pastes text", async () => {
    const pasted: string[] = []
    const term = {
      paste(text: string) {
        pasted.push(text)
      },
    }
    globalThis.navigator = {
      clipboard: {
        async readText() {
          return "echo test"
        },
      },
    } as unknown as Navigator

    await pasteFromClipboard(term as never)
    expect(pasted).toEqual(["echo test"])
  })

  test("pasteFromClipboard prompts when readText is unsupported", async () => {
    const pasted: string[] = []
    const term = {
      paste(text: string) {
        pasted.push(text)
      },
    }
    globalThis.navigator = { clipboard: {} } as Navigator
    globalThis.window.prompt = ((message: string) => {
      promptCalls.push(message)
      return "manual text"
    }) as typeof window.prompt

    await pasteFromClipboard(term as never)

    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0]).toContain("readText() is not supported")
    expect(pasted).toEqual(["manual text"])
  })

  test("pasteFromClipboard does nothing when prompt is cancelled", async () => {
    const pasted: string[] = []
    const term = {
      paste(text: string) {
        pasted.push(text)
      },
    }
    globalThis.navigator = { clipboard: {} } as Navigator
    globalThis.window.prompt = ((message: string) => {
      promptCalls.push(message)
      return null
    }) as typeof window.prompt

    await pasteFromClipboard(term as never)

    expect(promptCalls.length).toBe(1)
    expect(pasted).toEqual([])
  })

  test("pasteFromClipboard prompts with error context when readText throws", async () => {
    const pasted: string[] = []
    const term = {
      paste(text: string) {
        pasted.push(text)
      },
    }
    globalThis.navigator = {
      clipboard: {
        async readText() {
          throw new Error("Permission denied")
        },
      },
    } as unknown as Navigator
    globalThis.window.prompt = ((message: string) => {
      promptCalls.push(message)
      return "from prompt"
    }) as typeof window.prompt

    await pasteFromClipboard(term as never)

    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0]).toContain("Permission denied")
    expect(pasted).toEqual(["from prompt"])
  })
})

describe("setupCopyButtons integration", () => {
  test("throws when terminal element is missing", () => {
    const term = {
      getSelection: () => "",
      clearSelection() {},
      paste() {},
    }

    expect(() => setupCopyButtons(term as never)).toThrow("Missing terminal element")
  })

  test("wires mobile selection mode and forwards onCopySelection with with-text mode", async () => {
    globalThis.navigator = {
      clipboard: {
        async writeText() {},
      },
    } as unknown as Navigator
    installDocument(true)

    const term = {
      element: {},
      getSelection: () => "selection",
      clearSelection() {},
      paste() {},
    }

    setupCopyButtons(term as never)
    expect(capturedSelectionSetup).toBeDefined()

    const result = await capturedSelectionSetup?.onCopySelection("copied via mobile mode")
    expect(result).toBe(true)
    expect(alerts[0]).toContain("copied via mobile mode")
  })

  test("desktop copy button copies current selection", async () => {
    globalThis.navigator = {
      clipboard: {
        async writeText() {},
      },
    } as unknown as Navigator
    installDocument(true)

    let clearCalls = 0
    const term = {
      element: {},
      getSelection: () => "desktop selection",
      clearSelection() {
        clearCalls += 1
      },
      paste() {},
    }

    setupCopyButtons(term as never)
    clickToolbar(createToolbarButton(["copy-button"]))
    await flushMicrotasks()

    expect(clearCalls).toBe(1)
    expect(alerts[0]).toContain("desktop selection")
  })

  test("paste button reads clipboard and pastes text", async () => {
    const pasted: string[] = []
    globalThis.navigator = {
      clipboard: {
        async readText() {
          return "pasted from setup"
        },
      },
    } as Navigator

    const term = {
      element: {},
      getSelection: () => "",
      clearSelection() {},
      paste(text: string) {
        pasted.push(text)
      },
    }

    setupCopyButtons(term as never)
    clickToolbar(createToolbarButton(["paste-button"]))
    await flushMicrotasks()

    expect(pasted).toEqual(["pasted from setup"])
  })

  test("mobile layout does not trigger desktop copy path", async () => {
    mobileLayout = true
    let clearCalls = 0
    globalThis.navigator = {
      clipboard: {
        async writeText() {},
      },
    } as unknown as Navigator

    const term = {
      element: {},
      getSelection: () => "mobile selection",
      clearSelection() {
        clearCalls += 1
      },
      paste() {},
    }

    setupCopyButtons(term as never)
    clickToolbar(createToolbarButton(["copy-button"]))
    await flushMicrotasks()

    expect(clearCalls).toBe(0)
    expect(alerts).toEqual([])
  })

  test("ignores disabled toolbar buttons", async () => {
    const pasted: string[] = []
    globalThis.navigator = {
      clipboard: {
        async readText() {
          return "should not paste"
        },
      },
    } as unknown as Navigator

    const term = {
      element: {},
      getSelection: () => "",
      clearSelection() {},
      paste(text: string) {
        pasted.push(text)
      },
    }

    setupCopyButtons(term as never)
    clickToolbar(createToolbarButton(["paste-button"], true))
    await flushMicrotasks()

    expect(pasted).toEqual([])
  })
})

describe("mobile selection UI helpers", () => {
  test("setToolbarButtonsState disables non-copy-mode buttons and restores prior state", () => {
    const classStore = new Set<string>()

    function createButton(disabled: boolean) {
      return {
        disabled,
        dataset: {} as Record<string, string>,
        classList: {
          toggle(name: string, enabled: boolean) {
            if (enabled) classStore.add(name)
            else classStore.delete(name)
          },
          remove(name: string) {
            classStore.delete(name)
          },
        },
      }
    }

    const regularEnabled = createButton(false)
    const regularDisabled = createButton(true)
    const copyModeButton = createButton(false)
    const buttons = [regularEnabled, regularDisabled, copyModeButton]

    const toolbar = {
      querySelectorAll() {
        return buttons
      },
    }

    const copyModeButtons = {
      contains(node: unknown) {
        return node === copyModeButton
      },
    }

    setToolbarButtonsState(toolbar as never, copyModeButtons as never, true)
    expect(regularEnabled.disabled).toBe(true)
    expect(regularDisabled.disabled).toBe(true)
    expect(copyModeButton.disabled).toBe(false)

    setToolbarButtonsState(toolbar as never, copyModeButtons as never, false)
    expect(regularEnabled.disabled).toBe(false)
    expect(regularDisabled.disabled).toBe(true)
    expect(copyModeButton.disabled).toBe(false)
  })

  test("showHintOncePerSession alerts only once when sessionStorage works", () => {
    const store = new Map<string, string>()
    globalThis.sessionStorage = {
      getItem(key: string) {
        return store.get(key) ?? null
      },
      setItem(key: string, value: string) {
        store.set(key, value)
      },
    } as unknown as Storage

    showHintOncePerSession()
    showHintOncePerSession()

    expect(alerts.length).toBe(1)
  })

  test("showHintOncePerSession fallback alerts only once when storage throws", () => {
    globalThis.sessionStorage = {
      getItem() {
        throw new Error("storage blocked")
      },
      setItem() {
        throw new Error("storage blocked")
      },
    } as unknown as Storage

    showHintOncePerSession()
    showHintOncePerSession()

    expect(alerts.length).toBe(1)
  })
})

describe("ghostty-web patched selection coordinates", () => {
  test("select keeps viewport row visible when scrollback exists", () => {
    const manager = createSelectionManagerFixture({ scrollback: 300, viewportY: 0 })

    manager.select(7, 0, 1)

    expect(manager.getSelectionPosition()).toEqual({
      start: { x: 7, y: 0 },
      end: { x: 7, y: 0 },
    })
  })

  test("selectAll spans scrollback and active viewport", () => {
    const manager = createSelectionManagerFixture({ cols: 90, rows: 30, scrollback: 120, viewportY: 0 })

    manager.selectAll()

    expect(manager.getSelectionPosition()).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 89, y: 29 },
    })
  })
})
