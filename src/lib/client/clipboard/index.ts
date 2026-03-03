/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { getClickedButton, getElement } from "@/lib/client/utils"
import { copyCurrentSelection, copyTextToClipboard, pasteFromClipboard } from "./clipboard"
import { setupMobileSelectionMode } from "./mobile-selection"

const MOBILE_LAYOUT_QUERY = "(max-width: 768px)"

/**
 * Return whether the mobile layout media query matches.
 */
function isMobileLayout(): boolean {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches
}

/**
 * Wire up toolbar copy and paste buttons for the terminal.
 */
export function setupCopyButtons(term: Terminal): void {
  const toolbar = getElement(".toolbar")

  const terminalElement = term.element
  if (!terminalElement) throw new Error("Missing terminal element")

  setupMobileSelectionMode({
    term,
    toolbar,
    terminalElement,
    isMobileLayout,
    onCopySelection: (text) => copyTextToClipboard(text, "with-text"),
  })

  toolbar.addEventListener(
    "click",
    (event) => {
      const button = getClickedButton(event)
      if (!button || button.disabled) return

      if (button.classList.contains("paste-button")) {
        event.preventDefault()
        event.stopPropagation()
        void pasteFromClipboard(term)
        return
      }

      if (isMobileLayout() || !button.classList.contains("copy-button")) return

      event.preventDefault()
      event.stopPropagation()
      void copyCurrentSelection(term, "with-text")
    },
    { capture: true },
  )
}
