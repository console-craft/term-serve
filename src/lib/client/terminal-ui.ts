import type { Terminal } from "ghostty-web"
import { getElement, getOriginParts, isTouchCapableDevice, isVirtualKeyboardVisible } from "./utils"

export const SCROLL_GUTTER_WIDTH_PX = 28

/**
 * Writes the current host and port into the title bar subtitle.
 *
 * @returns {void}
 */
export function setTitlebarAddress(): void {
  const schemeElement = getElement(".origin-scheme")
  const hostElement = getElement(".origin-host")
  const portElement = getElement(".origin-port")

  const parts = getOriginParts()

  schemeElement.textContent = parts.scheme
  hostElement.textContent = parts.host
  portElement.textContent = parts.port
}

/**
 * Sets the connection status indicator.
 *
 * @param {string} status - The status to set (e.g., "connected", "disconnected", "error").
 * @param {string} text - The text to display next to the status indicator.
 */
export function setStatus(status: string, text: string) {
  const statusDot = getElement(".status-dot")
  const statusText = getElement(".status-text")

  statusDot.className = `status-dot ${status}`
  statusText.textContent = text
}

/**
 * Focuses the terminal input element (textarea) if it exists, otherwise focuses the terminal container element.
 * This is used to ensure that the terminal input remains focused when interacting with certain toolbar buttons,
 * especially on mobile devices to keep the virtual keyboard open.
 *
 * @param {Terminal} term - The terminal instance to focus.
 */
export function focusTerminalInput(term: Terminal): void {
  const input = term.textarea

  if (input) {
    input.focus({ preventScroll: true })
    return
  }

  term.focus()
}

/**
 * Prevents the mobile on-screen keyboard from being auto-triggered on initial load / reload.
 *
 * @param {Terminal} term The terminal instance to protect from startup auto-focus.
 * @returns {void}
 */
export function setupPreventStartupAutoFocus(term: Terminal): void {
  if (!isTouchCapableDevice()) return

  const terminalElement = term.element
  if (!terminalElement) return

  function blurIfTerminalIsFocused(): void {
    const activeElementOnLoad = document.activeElement
    if (!(activeElementOnLoad instanceof HTMLElement)) return

    // On initial load / reload the active element will usually be the terminal element itself or the textarea input contained by it.
    if (activeElementOnLoad === terminalElement || terminalElement?.contains(activeElementOnLoad)) {
      blurTerminalInput(term)
    }
  }

  setTimeout(() => blurIfTerminalIsFocused(), 0)
}

/**
 * Blurs the terminal input element (textarea) if it exists, otherwise blurs the terminal container element.
 * This is used to ensure that the terminal input is blurred when interacting with certain toolbar buttons,
 * especially on mobile devices to hide the virtual keyboard.
 *
 * @param {Terminal} term - The terminal instance to blur.
 */
export function blurTerminalInput(term: Terminal): void {
  const input = term.textarea

  if (input) input.blur()

  term.blur()
}

const noFollowUpButtonClasses = new Set<string>([
  "switch-keys-button",
  "escape-button",
  "tab-button",
  "ctrl-a-button",
  "ctrl-e-button",
  "ctrl-w-button",
  "ctrl-c-button",
  "ctrl-h-button",
  "ctrl-j-button",
  "ctrl-k-button",
  "ctrl-l-button",
  "return-button",
  "ctrl-y-button",
  "ctrl-n-button",
  "ctrl-p-button",
  "ctrl-f-button",
  "ctrl-b-button",
  "ctrl-d-button",
  "ctrl-u-button",
  "left-arrow-button",
  "down-arrow-button",
  "up-arrow-button",
  "right-arrow-button",
  "copy-button",
  "paste-button",
  "copy-mode-select-button",
  "copy-mode-copy-button",
  "copy-mode-esc-button",
])

/**
 * Checks if a given button is considered a "no follow-up" button, meaning it doesn't trigger a follow-up action
 * that would require the virtual keyboard to stay open on mobile devices.
 *
 * @param {HTMLButtonElement} button - The button element to check.
 * @returns {boolean} True if the button is a "no follow-up" button, otherwise false.
 */
function isNoFollowUpButton(button: HTMLButtonElement): boolean {
  for (const className of noFollowUpButtonClasses) {
    if (button.classList.contains(className)) return true
  }

  return false
}

/**
 * Determines whether interacting with a given button should keep the virtual keyboard open on mobile devices.
 * For "no follow-up" buttons, we want to keep the keyboard's visible state "as is" to avoid unwanted keyboard toggling.
 * For other buttons, we generally want to keep the keyboard open if it's already visible, or to open it if it's not.
 *
 * @param {HTMLButtonElement} button - The button element being interacted with.
 * @returns {boolean} True if the keyboard should be kept open or allowed to open, otherwise false.
 */
function wantsKeyboardOpen(button: HTMLButtonElement): boolean {
  if (!isNoFollowUpButton(button)) return true
  return isVirtualKeyboardVisible()
}

/**
 * Resolves the closest button element from a pointer or click event target within the toolbar.
 *
 * @param {Event} event The pointerdown or click event that was fired on the toolbar.
 * @returns {HTMLButtonElement | null} The closest button that was interacted with, if one exists; otherwise, null.
 */
function getToolbarButton(event: Event): HTMLButtonElement | null {
  const target = event.target
  if (!(target instanceof Element)) return null

  const button = target.closest("button")
  if (!(button instanceof HTMLButtonElement)) return null

  return button
}

/**
 * Sets up event listeners on the toolbar to keep the terminal input focused when interacting with certain toolbar buttons,
 * which is especially important on mobile devices to keep the virtual keyboard open.
 *
 * @param {Terminal} term - The terminal instance to focus when toolbar buttons are interacted with.
 */
export function setupToolbarTerminalFocus(term: Terminal): void {
  const toolbar = getElement(".toolbar")

  // 'click' fires too late to prevent terminal input focus from being lost, so we listen to 'pointerdown'.
  toolbar.addEventListener("pointerdown", (event) => {
    const button = getToolbarButton(event)
    if (!button) return

    // Prevent stealing focus so we can manage it manually based on the button type and virtual keyboard state.
    event.preventDefault()
    event.stopPropagation()

    // If the virtual keyboard is not visible we don't want to focus the terminal input in order to trigger it,
    // because the resulting viewport resize would cause other 'click' handlers to not get fired (eg. sticky Ctrl/Alt).
    // This usecase is handled in the 'click' event listener below.
    if (window.visualViewport && !isVirtualKeyboardVisible()) return

    // For buttons that don't require a follow-up action (eg. non-sticky buttons) we want to keep the keyboard's
    // visible state "as is".
    if (!wantsKeyboardOpen(button)) return

    // Finally focus the terminal input (safe, since the virtual keyboard is already visible).
    focusTerminalInput(term)
  })

  // We still use 'click' as a fallback for keyboard based activation, and for the hidden virtual keyboard case above
  // where we intentionally avoided focusing on 'pointerdown' to allow clicks (that toggle sticky modifier state for Ctrl/Alt) to get fired.
  toolbar.addEventListener("click", (event) => {
    const button = getToolbarButton(event)
    if (!button) return

    // Prevent stealing focus so we can manage it manually based on the button type and virtual keyboard state.
    event.preventDefault()
    event.stopPropagation()

    // For buttons that don't require a follow-up action (eg. non-sticky buttons) we want to keep the keyboard's
    // open state "as is".
    if (!wantsKeyboardOpen(button)) return

    // Finally, focus the terminal input (and keep virtual keyboard visible or trigger it - safe here).
    focusTerminalInput(term)
  })
}

/**
 * Sets the pressed visual state for all buttons that share a CSS class.
 *
 * @param {string} buttonClass The class used to select matching toolbar buttons.
 * @param {boolean} isPressed Whether the buttons should be shown as pressed.
 */
export function setButtonsPressedState(buttonClass: string, isPressed: boolean): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`.${buttonClass}`)

  buttons.forEach((button) => {
    button.classList.toggle("pressed", isPressed)
  })
}

/**
 * Checks if a given clientX coordinate is within the scroll gutter area of a container element.
 * The scroll gutter is a reserved area on the right edge of the terminal used to trigger scrolling on touch devices.
 *
 * @param {number} clientX - The X coordinate of the pointer event to check.
 * @param {HTMLElement} container - The container element to check against (typically the terminal element).
 * @returns {boolean} True if the clientX coordinate is within the scroll gutter area, otherwise false.
 */
export function isInScrollGutter(clientX: number, container: HTMLElement): boolean {
  const rect = container.getBoundingClientRect()

  return clientX >= rect.right - SCROLL_GUTTER_WIDTH_PX
}

/**
 * Checks if the terminal input is currently locked (not focusable or editable).
 * This can happen when the terminal is in a state where user input should be temporarily disabled (eg. copy mode).
 *
 * @param {Terminal} term - The terminal instance to check the input state of.
 * @param {HTMLElement} terminalElement - The root element of the terminal to check for contenteditable state.
 * @returns {boolean} True if the terminal input is locked, otherwise false.
 */
export function isTerminalInputLocked(term: Terminal, terminalElement: HTMLElement): boolean {
  if (terminalElement.getAttribute("contenteditable") === "false") return true

  const input = term.textarea
  if (!input) return false

  return input.hasAttribute("readonly") || input.style.pointerEvents === "none"
}

/**
 * Calculates the available content height for the terminal when the virtual keyboard is visible on mobile devices.
 * If the visual viewport API is not supported, this function returns -1 to indicate that the content height cannot be determined.
 *
 * @returns {number} The calculated content height for the terminal when the virtual keyboard is visible, or -1 if the visual viewport API is not supported.
 */
export function getContentHeightWhenKeyboardIsVisible(): number {
  const viewport = window.visualViewport

  if (!viewport) {
    return -1
  }

  const titlebarHeight = getElement(".title-bar")?.getBoundingClientRect().height
  const toolbarHeight = getElement(".toolbar")?.getBoundingClientRect().height
  const viewportHeight = viewport.height ?? window.innerHeight

  return viewportHeight - titlebarHeight - toolbarHeight
}

/**
 * Sets up the "Switch Keys" button to toggle between primary and secondary key sets in the terminal toolbar.
 */
export function setupSwitchKeysButton(): void {
  const switchKeysButton = getElement(".switch-keys-button")
  const primaryButtons = getElement(".primary-buttons")
  const secondaryButtons = getElement(".secondary-buttons")

  switchKeysButton.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()

    const showSecondary = secondaryButtons.classList.contains("hidden")
    secondaryButtons.classList.toggle("hidden", !showSecondary)
    primaryButtons.classList.toggle("hidden", showSecondary)
  })
}
