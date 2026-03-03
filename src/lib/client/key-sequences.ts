import { CONTROL_CHARACTERS, CONTROL_SEQUENCES } from "./ansi"
import { setButtonsPressedState } from "./terminal-ui"
import { getClickedButton, getElement } from "./utils"

type StickyModifiers = {
  ctrl: boolean
  alt: boolean
}

export type SendKeysController = {
  parseInput(input: string): string
}

/**
 * Checks whether any sticky modifier key is currently active.
 *
 * @param {StickyModifiers} state The current sticky modifier state.
 * @returns {boolean} True when either Ctrl or Alt is active.
 */
function modifiersActive(state: StickyModifiers): boolean {
  return state.ctrl || state.alt
}

/**
 * Clears any active sticky modifiers and refreshes modifier button styles.
 *
 * @param {StickyModifiers} state The current sticky modifier state.
 */
function clearModifiers(state: StickyModifiers): void {
  if (!modifiersActive(state)) return

  state.ctrl = false
  state.alt = false
  setButtonsPressedState("ctrl-button", state.ctrl)
  setButtonsPressedState("alt-button", state.alt)
}

/**
 * Converts a subset of single printable characters into a control character.
 *
 * NOTE: Multi-byte key inputs (arrow keys) aren’t covered because Ctrl-modification isn’t a simple per-character mapping;
 * it requires emitting terminal-specific “modified cursor key” escape sequences (mode-dependent, not universal).
 *
 * @param {string} input The input character to convert.
 * @returns {string} The converted control character when supported; otherwise the original input.
 */
export function charToControlCharacter(input: string): string {
  if (input.length !== 1) return input

  const char = input.charAt(0)
  const code = char.toLowerCase().charCodeAt(0)
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(code - 96) // "\x01" (a) -> "\x1a" (z)
  }

  switch (char) {
    case "@":
    case " ":
      return CONTROL_CHARACTERS.nul
    case "[":
      return CONTROL_CHARACTERS.escape
    case "\\":
      return CONTROL_CHARACTERS.fileSeparator
    case "]":
      return CONTROL_CHARACTERS.groupSeparator
    case "^":
      return CONTROL_CHARACTERS.recordSeparator
    case "_":
      return CONTROL_CHARACTERS.unitSeparator
    case "?":
      return CONTROL_CHARACTERS.delete
    default:
      // Cases not handled above, including already converted control characters (Ctrl+C -> \x03) are returned as-is.
      return input
  }
}

/**
 * Applies active sticky modifiers to a string before it is sent to the terminal.
 *
 * @param {string} input The input sequence to transform.
 * @param {StickyModifiers} state The current sticky modifier state.
 * @returns {string} The transformed input sequence with active modifiers applied.
 */
function applyModifiers(input: string, state: StickyModifiers): string {
  let result = input
  if (state.ctrl) result = charToControlCharacter(result)
  if (state.alt) result = `${CONTROL_CHARACTERS.escape}${result}` // Alt is implemented as a leading Esc (i.e. Meta)
  return result
}

const classToControlCharOrSequence: Readonly<Record<string, string>> = {
  "escape-button": CONTROL_CHARACTERS.escape,
  "tab-button": CONTROL_CHARACTERS.tab,
  "ctrl-a-button": CONTROL_CHARACTERS.ctrlA,
  "ctrl-e-button": CONTROL_CHARACTERS.ctrlE,
  "ctrl-w-button": CONTROL_CHARACTERS.ctrlW,
  "ctrl-c-button": CONTROL_CHARACTERS.ctrlC,
  "ctrl-h-button": CONTROL_CHARACTERS.ctrlH,
  "ctrl-j-button": CONTROL_CHARACTERS.ctrlJ,
  "ctrl-k-button": CONTROL_CHARACTERS.ctrlK,
  "ctrl-l-button": CONTROL_CHARACTERS.ctrlL,
  "slash-button": "/",
  "return-button": CONTROL_CHARACTERS.carriageReturn,
  "ctrl-y-button": CONTROL_CHARACTERS.ctrlY,
  "ctrl-n-button": CONTROL_CHARACTERS.ctrlN,
  "ctrl-p-button": CONTROL_CHARACTERS.ctrlP,
  "ctrl-f-button": CONTROL_CHARACTERS.ctrlF,
  "ctrl-b-button": CONTROL_CHARACTERS.ctrlB,
  "ctrl-d-button": CONTROL_CHARACTERS.ctrlD,
  "ctrl-u-button": CONTROL_CHARACTERS.ctrlU,
  "left-arrow-button": CONTROL_SEQUENCES.cursorLeft,
  "down-arrow-button": CONTROL_SEQUENCES.cursorDown,
  "up-arrow-button": CONTROL_SEQUENCES.cursorUp,
  "right-arrow-button": CONTROL_SEQUENCES.cursorRight,
}

/**
 * Returns the input sequence associated with a toolbar button based on its CSS class.
 *
 * @param {HTMLButtonElement} button The toolbar button to inspect.
 * @returns {string | null} The matching input sequence, or null when unsupported.
 */
function getButtonControlCharOrSequenceFromClass(button: HTMLButtonElement): string | null {
  for (const [className, sequence] of Object.entries(classToControlCharOrSequence)) {
    if (button.classList.contains(className)) return sequence
  }

  return null
}

/**
 * Toggles a sticky modifier key and synchronizes modifier button styles.
 *
 * @param {"ctrl" | "alt"} button The modifier key to toggle.
 * @param {StickyModifiers} state The current sticky modifier state.
 */
function toggleModifier(button: "ctrl" | "alt", state: StickyModifiers): void {
  if (button === "ctrl") {
    state.ctrl = !state.ctrl
  } else {
    state.alt = !state.alt
  }

  setButtonsPressedState("ctrl-button", state.ctrl)
  setButtonsPressedState("alt-button", state.alt)
}

/**
 * Wires toolbar Send Keys buttons to terminal input handling, including sticky Ctrl/Alt modifiers.
 *
 * @param {(input: string) => void} sendInputViaWebsocket Sends transformed input to the terminal transport.
 * @returns {SendKeysController} Controller used to apply sticky modifiers to typed terminal input.
 */
export function createSendKeysController(sendInputViaWebsocket: (input: string) => void): SendKeysController {
  const modifierState: StickyModifiers = { ctrl: false, alt: false }
  const toolbar = getElement(".toolbar")

  // Parse and send button clicks.
  toolbar.addEventListener("click", (event) => {
    const button = getClickedButton(event)
    if (!button) return

    if (button.classList.contains("ctrl-button")) {
      event.preventDefault()
      toggleModifier("ctrl", modifierState)
      return
    }

    if (button.classList.contains("alt-button")) {
      event.preventDefault()
      toggleModifier("alt", modifierState)
      return
    }

    const sequence = getButtonControlCharOrSequenceFromClass(button)
    if (!sequence) return

    event.preventDefault()
    sendInputViaWebsocket(applyModifiers(sequence, modifierState))
    clearModifiers(modifierState)
  })

  setButtonsPressedState("ctrl-button", modifierState.ctrl)
  setButtonsPressedState("alt-button", modifierState.alt)

  return {
    // Helper to parse raw input typed in the terminal.
    parseInput(input: string): string {
      if (!modifiersActive(modifierState)) return input

      const result = applyModifiers(input, modifierState)
      clearModifiers(modifierState)

      return result
    },
  }
}
