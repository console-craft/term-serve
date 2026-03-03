/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"

const CURSOR_OVERLAY_CLASS = "mobile-selection-cursor"

type Cursor = { col: number; row: number }

export type Direction = "left" | "down" | "up" | "right"
export type SelectionPhase = "inactive" | "choose-start" | "choose-end"

type SelectionState = {
  phase: SelectionPhase
  cursor: Cursor | null
  start: Cursor | null
}

export type MobileSelectionEngine = {
  isActive: () => boolean
  getPhase: () => SelectionPhase
  getSelectionText: () => string
  enter: () => void
  exit: () => void
  lockStart: () => void
  cancel: () => void
  move: (direction: Direction) => void
  refresh: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function ensureCursorOverlay(terminalElement: HTMLElement): HTMLDivElement {
  const existing = terminalElement.querySelector<HTMLDivElement>(`.${CURSOR_OVERLAY_CLASS}`)
  if (existing) return existing

  const overlay = document.createElement("div")
  overlay.className = CURSOR_OVERLAY_CLASS
  terminalElement.append(overlay)
  return overlay
}

function getCurrentTerminalCursor(term: Terminal): Cursor {
  const maxCol = Math.max(0, term.cols - 1)
  const maxRow = Math.max(0, term.rows - 1)
  return {
    col: clamp(term.buffer.active.cursorX, 0, maxCol),
    row: clamp(term.buffer.active.cursorY, 0, maxRow),
  }
}

function renderOverlay(term: Terminal, terminalElement: HTMLElement, overlay: HTMLDivElement, cursor: Cursor): void {
  const renderer = term.renderer
  const canvas = terminalElement.querySelector<HTMLCanvasElement>("canvas")
  if (!renderer || !canvas) {
    overlay.style.display = "none"
    return
  }

  const metrics = renderer.getMetrics()
  const canvasRect = canvas.getBoundingClientRect()
  const terminalRect = terminalElement.getBoundingClientRect()
  const left = canvasRect.left - terminalRect.left + cursor.col * metrics.width
  const top = canvasRect.top - terminalRect.top + cursor.row * metrics.height

  overlay.style.display = "block"
  overlay.style.width = `${metrics.width}px`
  overlay.style.height = `${metrics.height}px`
  overlay.style.transform = `translate(${left}px, ${top}px)`
}

function renderSelection(
  term: Terminal,
  terminalElement: HTMLElement,
  overlay: HTMLDivElement,
  state: SelectionState,
): void {
  const cursor = state.cursor
  if (state.phase === "inactive" || !cursor) {
    overlay.style.display = "none"
    return
  }

  const cols = Math.max(1, term.cols)
  if (state.phase === "choose-end" && state.start) {
    const startIndex = state.start.row * cols + state.start.col
    const endIndex = cursor.row * cols + cursor.col
    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)
    const len = maxIndex - minIndex + 1
    if (len <= 1) {
      term.clearSelection()
    } else {
      term.select(minIndex % cols, Math.floor(minIndex / cols), len)
    }
  } else {
    term.clearSelection()
  }

  renderOverlay(term, terminalElement, overlay, cursor)
}

function clearSelectionImmediately(term: Terminal): void {
  term.clearSelection()

  const pos = term.getSelectionPosition()
  if (!pos) return

  const cols = Math.max(1, term.cols)
  const rows = Math.max(1, term.rows)
  if (cols * rows < 2) return

  term.select(0, 0, 2)
  term.clearSelection()
}

export function createMobileSelectionEngine(term: Terminal, terminalElement: HTMLElement): MobileSelectionEngine {
  const overlay = ensureCursorOverlay(terminalElement)
  const state: SelectionState = {
    phase: "inactive",
    cursor: null,
    start: null,
  }

  function refresh(): void {
    renderSelection(term, terminalElement, overlay, state)
  }

  function enter(): void {
    state.phase = "choose-start"
    state.cursor = getCurrentTerminalCursor(term)
    state.start = null
    clearSelectionImmediately(term)
    refresh()
  }

  function exit(): void {
    clearSelectionImmediately(term)
    state.phase = "inactive"
    state.cursor = null
    state.start = null
    refresh()
  }

  function lockStart(): void {
    if (!state.cursor) state.cursor = getCurrentTerminalCursor(term)
    state.start = { col: state.cursor.col, row: state.cursor.row }
    state.phase = "choose-end"
    refresh()
  }

  function cancel(): void {
    clearSelectionImmediately(term)

    if (state.phase !== "choose-end") {
      exit()
      return
    }

    state.phase = "choose-start"
    state.start = null
    refresh()
  }

  function move(direction: Direction): void {
    if (!state.cursor) state.cursor = getCurrentTerminalCursor(term)

    const cursor = state.cursor
    if (!cursor) return

    const cols = Math.max(1, term.cols)
    const rows = Math.max(1, term.rows)
    const maxIndex = Math.max(0, cols * rows - 1)
    let index = clamp(cursor.row * cols + cursor.col, 0, maxIndex)

    if (direction === "left") index = Math.max(0, index - 1)
    if (direction === "right") index = Math.min(maxIndex, index + 1)
    if (direction === "up") index = Math.max(0, index - cols)
    if (direction === "down") index = Math.min(maxIndex, index + cols)

    state.cursor = { col: index % cols, row: Math.floor(index / cols) }
    refresh()
  }

  return {
    isActive: () => state.phase !== "inactive",
    getPhase: () => state.phase,
    getSelectionText: () => term.getSelection(),
    enter,
    exit,
    lockStart,
    cancel,
    move,
    refresh,
  }
}
