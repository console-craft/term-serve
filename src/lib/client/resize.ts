import type { Terminal } from "ghostty-web"
import { FitAddon } from "ghostty-web"
import {
  blurTerminalInput,
  focusTerminalInput,
  getContentHeightWhenKeyboardIsVisible,
  isInScrollGutter,
  isTerminalInputLocked,
} from "./terminal-ui"

import {
  getElement,
  getOrientation,
  hasMobileWidth,
  isTouchCapableDevice,
  isVirtualKeyboardVisible,
  type Orientation,
} from "./utils"

/**
 * Sets up the terminal to automatically fit its container size and observe for resize changes.
 *
 * @param {Terminal} term - The terminal instance to set up.
 */
export function handleSyncTerminalSizeToContainer(term: Terminal): void {
  // Fit terminal to container size.
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  fitAddon.fit()
  fitAddon.observeResize()

  // If window resize doesn’t sometimes trigger ResizeObserver, always trigger `fit()` manually too as a fallback.
  window.addEventListener("resize", () => fitAddon.fit())
}

/**
 * Adjusts the terminal window and content heights when the orientation changes or when the mobile on-screen keyboard is toggled.
 * This is a "best effort" solution since standards implementation varies across devices and mobile browsers.
 */
export function handleViewportResize() {
  const viewport = window.visualViewport

  if (!viewport) {
    return
  }

  let orientation: Orientation

  const terminalWindow = getElement(".terminal-window")
  const terminalContent = getElement(".terminal-content")

  const originalHeight: Record<Orientation, number | null> = {
    portrait: null,
    landscape: null,
  }

  viewport.addEventListener("resize", () => {
    orientation = getOrientation()

    if (!originalHeight[orientation]) {
      originalHeight[orientation] = terminalContent.getBoundingClientRect().height
    }

    if (hasMobileWidth(terminalContent)) {
      // biome-ignore lint/style/useTemplate: Better readability
      terminalWindow.style.height = viewport.height + "px"

      if (isVirtualKeyboardVisible()) {
        // biome-ignore lint/style/useTemplate: Better readability
        terminalContent.style.height = getContentHeightWhenKeyboardIsVisible() + "px"
      } else {
        // biome-ignore lint/style/useTemplate: Better readability
        terminalContent.style.height = originalHeight[orientation] + "px"
      }
    }
  })
}

/**
 * Handles tapping terminal content on mobile to toggle the on-screen keyboard.
 * - If input is focused: blur to dismiss OSK.
 * - If input is not focused: focus to show OSK.
 *
 * Does not trigger in the scroll gutter.
 *
 * @param {Terminal} term - The terminal instance to set up the mobile keyboard toggle for.
 */
export function handleMobileKeyboardToggle(term: Terminal): void {
  if (!isTouchCapableDevice()) return

  const terminalElement = term.element
  if (!terminalElement) return

  let suppressUntil = 0

  // Handle pointer down on terminal content to toggle keyboard.
  terminalElement.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "touch") return
      if (!event.isPrimary) return
      if (isInScrollGutter(event.clientX, terminalElement)) return
      if (isTerminalInputLocked(term, terminalElement)) return

      const input = term.textarea
      const isFocused = !!input && document.activeElement === input

      if (isFocused) {
        event.preventDefault()
        event.stopPropagation()
        blurTerminalInput(term)
        suppressUntil = performance.now() + 800
        return
      }

      // Focus in the same user gesture so mobile browsers can open the OSK.
      focusTerminalInput(term)
    },
    { capture: true },
  )

  // For a short period right after we blur, prevent any pointerup events (usually fired by pointerdown) from triggering the OSK via terminal interactions.
  terminalElement.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerType !== "touch") return
      if (performance.now() > suppressUntil) return
      if (isInScrollGutter(event.clientX, terminalElement)) return
      event.preventDefault()
      event.stopPropagation()
    },
    { capture: true },
  )

  // For a short period right after we blur, prevent any click events (usually fired by pointerdown) from triggering the OSK via terminal interactions.
  terminalElement.addEventListener(
    "click",
    (event) => {
      if (performance.now() > suppressUntil) return
      if (!(event instanceof MouseEvent)) return
      if (isInScrollGutter(event.clientX, terminalElement)) return
      event.preventDefault()
      event.stopPropagation()
    },
    { capture: true },
  )

  // If the terminal tries to re-focus asynchronously right after we blur, immediately blur again.
  document.addEventListener(
    "focusin",
    (event) => {
      if (performance.now() > suppressUntil) return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target !== term.textarea) return
      blurTerminalInput(term)
    },
    { capture: true },
  )
}
