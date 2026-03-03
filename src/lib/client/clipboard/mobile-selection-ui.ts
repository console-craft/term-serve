/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { asResult } from "@/utils/safe-result"
import type { SelectionPhase } from "./mobile-selection-engine"

const HINT_SESSION_KEY = "term-serve-mobile-selection-hint"
const HINT_TEXT =
  "Move to selection start, tap the start selection button, move to selection end, then tap copy. Esc cancels selection or exits copy mode."

export type LayoutMode = "primary" | "secondary"

export type MobileSelectionControls = {
  primaryButtons: HTMLElement
  secondaryButtons: HTMLElement
  copyModeButtons: HTMLElement
  selectButton: HTMLButtonElement
  copyButton: HTMLButtonElement
}

let showedHintFallback = false

export function getMobileSelectionControls(toolbar: HTMLElement): MobileSelectionControls {
  const primaryButtons = toolbar.querySelector<HTMLElement>(".primary-buttons")
  const secondaryButtons = toolbar.querySelector<HTMLElement>(".secondary-buttons")
  const copyModeButtons = toolbar.querySelector<HTMLElement>(".copy-mode-buttons")
  const selectButton = toolbar.querySelector<HTMLButtonElement>(".copy-mode-select-button")
  const copyButton = toolbar.querySelector<HTMLButtonElement>(".copy-mode-copy-button")

  if (!primaryButtons || !secondaryButtons || !copyModeButtons || !selectButton || !copyButton) {
    throw new Error("Missing mobile copy mode controls")
  }

  return {
    primaryButtons,
    secondaryButtons,
    copyModeButtons,
    selectButton,
    copyButton,
  }
}

export function readCurrentLayoutMode(secondaryButtons: HTMLElement): LayoutMode {
  return secondaryButtons.classList.contains("hidden") ? "primary" : "secondary"
}

export function setMainLayoutVisibility(
  primaryButtons: HTMLElement,
  secondaryButtons: HTMLElement,
  copyModeActive: boolean,
  previousLayout: LayoutMode,
): void {
  if (copyModeActive) {
    primaryButtons.classList.add("hidden")
    secondaryButtons.classList.add("hidden")
    return
  }

  if (previousLayout === "secondary") {
    primaryButtons.classList.add("hidden")
    secondaryButtons.classList.remove("hidden")
    return
  }

  primaryButtons.classList.remove("hidden")
  secondaryButtons.classList.add("hidden")
}

export function setToolbarButtonsState(toolbar: HTMLElement, copyModeButtons: HTMLElement, inCopyMode: boolean): void {
  const buttons = toolbar.querySelectorAll<HTMLButtonElement>("button")

  buttons.forEach((button) => {
    if (inCopyMode) {
      button.dataset.copyModePrevDisabled = button.disabled ? "1" : "0"
      const enabled = copyModeButtons.contains(button)
      button.disabled = !enabled
      button.classList.toggle("selection-mode-disabled", !enabled)
      return
    }

    const previousDisabled = button.dataset.copyModePrevDisabled === "1"
    button.disabled = previousDisabled
    delete button.dataset.copyModePrevDisabled
    button.classList.remove("selection-mode-disabled")
  })
}

export function setSelectionButtonsState(
  copyModeButtons: HTMLElement,
  selectButton: HTMLButtonElement,
  copyButton: HTMLButtonElement,
  phase: SelectionPhase,
): void {
  const inCopyMode = phase !== "inactive"
  copyModeButtons.classList.toggle("hidden", !inCopyMode)

  if (!inCopyMode) {
    selectButton.classList.remove("copy-mode-select-active")
    copyButton.disabled = true
    return
  }

  const startLocked = phase === "choose-end"
  selectButton.classList.toggle("copy-mode-select-active", startLocked)
  copyButton.disabled = !startLocked
}

export function setSelectionKeyboardLock(term: Terminal, locked: boolean): void {
  if (term.element) term.element.setAttribute("contenteditable", locked ? "false" : "true")

  const input = term.textarea
  if (!input) return

  if (locked) {
    input.setAttribute("readonly", "readonly")
    input.style.pointerEvents = "none"
    input.blur()
    term.blur()
    return
  }

  input.removeAttribute("readonly")
  input.style.pointerEvents = ""
}

export function showHintOncePerSession(): void {
  const [storageError, storage] = asResult(() => sessionStorage)
  if (storageError || !storage) {
    if (showedHintFallback) {
      return
    }

    showedHintFallback = true
    alert(HINT_TEXT)
    return
  }

  const [readError, shownInSession] = asResult(() => storage.getItem(HINT_SESSION_KEY))
  if (readError) {
    if (showedHintFallback) {
      return
    }

    showedHintFallback = true
    alert(HINT_TEXT)
    return
  }

  if (shownInSession === "1") {
    return
  }

  alert(HINT_TEXT)
  const [writeError] = asResult(() => storage.setItem(HINT_SESSION_KEY, "1"))
  if (writeError) {
    showedHintFallback = true
  }
}
