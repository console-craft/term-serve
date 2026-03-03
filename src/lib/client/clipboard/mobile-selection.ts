/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { isInScrollGutter } from "@/lib/client/terminal-ui"
import { getClickedButton } from "@/lib/client/utils"
import { createMobileSelectionEngine, type Direction } from "./mobile-selection-engine"
import {
  getMobileSelectionControls,
  type LayoutMode,
  readCurrentLayoutMode,
  setMainLayoutVisibility,
  setSelectionButtonsState,
  setSelectionKeyboardLock,
  setToolbarButtonsState,
  showHintOncePerSession,
} from "./mobile-selection-ui"

type MobileSelectionOpts = {
  term: Terminal
  toolbar: HTMLElement
  terminalElement: HTMLElement
  isMobileLayout: () => boolean
  onCopySelection: (text: string) => Promise<boolean>
}

function getArrowDirection(button: HTMLButtonElement): Direction | null {
  if (button.classList.contains("left-arrow-button")) return "left"
  if (button.classList.contains("down-arrow-button")) return "down"
  if (button.classList.contains("up-arrow-button")) return "up"
  if (button.classList.contains("right-arrow-button")) return "right"
  return null
}

/**
 * Attach mobile selection-mode behavior to toolbar and terminal.
 */
export function setupMobileSelectionMode(opts: MobileSelectionOpts): void {
  const { term, toolbar, terminalElement, isMobileLayout, onCopySelection } = opts
  const controls = getMobileSelectionControls(toolbar)
  const engine = createMobileSelectionEngine(term, terminalElement)

  let previousLayout: LayoutMode = "primary"

  function refreshSelectionUi(): void {
    setSelectionButtonsState(controls.copyModeButtons, controls.selectButton, controls.copyButton, engine.getPhase())
    engine.refresh()
  }

  function setSelectionModeUi(active: boolean): void {
    setSelectionKeyboardLock(term, active)
    setMainLayoutVisibility(controls.primaryButtons, controls.secondaryButtons, active, previousLayout)
    setToolbarButtonsState(toolbar, controls.copyModeButtons, active)
  }

  function enterSelectionMode(): void {
    previousLayout = readCurrentLayoutMode(controls.secondaryButtons)
    engine.enter()
    setSelectionModeUi(true)
    refreshSelectionUi()
    showHintOncePerSession()
  }

  function exitSelectionMode(): void {
    engine.exit()
    setSelectionModeUi(false)
    refreshSelectionUi()
  }

  async function copyAndExit(): Promise<void> {
    if (engine.getPhase() !== "choose-end") return

    const text = engine.getSelectionText()
    if (!text) {
      exitSelectionMode()
      return
    }

    try {
      await onCopySelection(text)
    } finally {
      exitSelectionMode()
    }
  }

  function handleToolbarAction(button: HTMLButtonElement): boolean {
    if (!engine.isActive()) {
      if (!isMobileLayout() || !button.classList.contains("copy-button")) return false
      enterSelectionMode()
      return true
    }

    if (button.classList.contains("copy-mode-select-button")) {
      engine.lockStart()
      refreshSelectionUi()
      return true
    }

    if (button.classList.contains("copy-mode-copy-button")) {
      void copyAndExit()
      return true
    }

    if (button.classList.contains("copy-mode-esc-button")) {
      const activeBeforeCancel = engine.isActive()
      engine.cancel()

      if (activeBeforeCancel && !engine.isActive()) {
        setSelectionModeUi(false)
      }

      refreshSelectionUi()
      return true
    }

    const direction = getArrowDirection(button)
    if (!direction || !button.closest(".copy-mode-buttons")) return false

    engine.move(direction)
    return true
  }

  toolbar.addEventListener(
    "click",
    (event) => {
      const button = getClickedButton(event)
      if (!button) return

      const handled = handleToolbarAction(button)
      if (!handled) return

      event.preventDefault()
      event.stopPropagation()
    },
    { capture: true },
  )

  function blockTerminalPointerWhenSelectionMode(event: PointerEvent): void {
    if (event.pointerType !== "touch") return
    if (!engine.isActive()) return
    if (isInScrollGutter(event.clientX, terminalElement)) return

    event.preventDefault()
    event.stopPropagation()
  }

  terminalElement.addEventListener("pointerdown", blockTerminalPointerWhenSelectionMode, { capture: true })
  terminalElement.addEventListener("pointermove", blockTerminalPointerWhenSelectionMode, { capture: true })
  terminalElement.addEventListener("pointerup", blockTerminalPointerWhenSelectionMode, { capture: true })
  terminalElement.addEventListener("pointercancel", blockTerminalPointerWhenSelectionMode, { capture: true })

  terminalElement.addEventListener(
    "click",
    (event) => {
      if (!engine.isActive()) return
      event.preventDefault()
      event.stopPropagation()
    },
    { capture: true },
  )

  term.onResize(() => refreshSelectionUi())
  window.addEventListener("resize", () => refreshSelectionUi())
}
