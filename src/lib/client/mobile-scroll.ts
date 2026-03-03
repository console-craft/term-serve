/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { isInScrollGutter } from "./terminal-ui"
import { dispatchWheelEvent, isTouchCapableDevice } from "./utils"

type ScrollState = {
  activePointerId: number | null
  lastY: number | null
}

type ScrollDirection = "natural" | "traditional"

const MOBILE_SCROLL_SPEED_MULTIPLIER = 3.5
const SCROLL_DIRECTION: ScrollDirection = "natural"

/**
 * Resets the scroll state by clearing the active pointer ID and last Y position.
 *
 * @param {ScrollState} state - The scroll state object to reset.
 */
function resetScrollState(state: ScrollState): void {
  state.activePointerId = null
  state.lastY = null
}

/**
 * Sets up pointer event listeners on the terminal element to enable touch-based scrolling on mobile devices.
 * This function listens for pointer events and translates vertical touch movements into synthetic wheel events to scroll the terminal content.
 * The scroll gesture is only recognized when initiated within the scroll gutter area on the right edge of the terminal.
 *
 * @param {Terminal} term - The terminal instance to set up pointer interactions for.
 * @returns {void}
 */
export function setupMobileGutterScroll(term: Terminal): void {
  if (!isTouchCapableDevice()) return

  const terminalElement = term.element
  if (!terminalElement) return

  const state: ScrollState = { activePointerId: null, lastY: null }

  terminalElement.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return

    if (!event.isPrimary) {
      resetScrollState(state)
      return
    }

    if (!isInScrollGutter(event.clientX, terminalElement)) {
      resetScrollState(state)
      return
    }

    state.activePointerId = event.pointerId
    state.lastY = event.clientY
    terminalElement.setPointerCapture(event.pointerId)
    event.preventDefault()
  })

  terminalElement.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") return
    if (event.pointerId !== state.activePointerId || state.lastY === null) return

    const deltaY = event.clientY - state.lastY
    if (Math.abs(deltaY) >= 0.5) {
      const scaledDeltaY = deltaY * MOBILE_SCROLL_SPEED_MULTIPLIER
      const adjustedDeltaY = SCROLL_DIRECTION === "traditional" ? scaledDeltaY : -scaledDeltaY
      dispatchWheelEvent(terminalElement, event.clientX, event.clientY, adjustedDeltaY)
      state.lastY = event.clientY
    }

    event.preventDefault()
  })

  terminalElement.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return
    if (event.pointerId !== state.activePointerId) return

    if (terminalElement.hasPointerCapture(event.pointerId)) {
      terminalElement.releasePointerCapture(event.pointerId)
    }
    resetScrollState(state)
    event.preventDefault()
  })

  terminalElement.addEventListener("pointercancel", (event) => {
    if (event.pointerType !== "touch") return
    if (event.pointerId !== state.activePointerId) return

    if (terminalElement.hasPointerCapture(event.pointerId)) {
      terminalElement.releasePointerCapture(event.pointerId)
    }
    resetScrollState(state)
  })
}
