import { CONTROL_CHARACTERS, CONTROL_SEQUENCES } from "./ansi"
import { charToControlCharacter } from "./key-sequences"

export type KeymapsPaletteItem = {
  keys: string
  description: string
}

export const KEYMAPS: ReadonlyArray<KeymapsPaletteItem> = [
  { keys: "Enter", description: "Run current command" },
  { keys: "Esc", description: "Cancel interactive action" },
  { keys: "Tab", description: "Autocomplete command or path" },
  { keys: "Left", description: "Move cursor left" },
  { keys: "Down", description: "Next command in history" },
  { keys: "Up", description: "Previous command in history" },
  { keys: "Right", description: "Move cursor right" },
  { keys: "Ctrl+A", description: "Move cursor to beginning of line" },
  { keys: "Ctrl+E", description: "Move cursor to end of line | Scroll down one line (vim/less)" },
  { keys: "Ctrl+Y", description: "Paste last deleted text | Scroll up one line (vim/less)" },
  { keys: "Ctrl+W", description: "Delete previous word | Window commands (vim)" },
  { keys: "Ctrl+C", description: "Interrupt current process" },
  { keys: "Ctrl+H", description: "Delete previous character" },
  { keys: "Ctrl+J", description: "New line (accept line or autocomplete)" },
  { keys: "Ctrl+K", description: "Delete to end of line" },
  { keys: "Ctrl+L", description: "Clear screen" },
  { keys: "Ctrl+N", description: "Next command in history | Next item (vim)" },
  { keys: "Ctrl+P", description: "Previous command in history | Previous item (vim)" },
  { keys: "Ctrl+F", description: "Move cursor forward one character | Page down (vim/less)" },
  { keys: "Ctrl+B", description: "Move cursor backward one character | Page up (vim/less)" },
  { keys: "Ctrl+D", description: "Delete current character or exit shell | Half page down (vim/less)" },
  { keys: "Ctrl+U", description: "Delete to beginning of line | Half page down (vim/less)" },
  { keys: "Ctrl+R", description: "Reverse-search command history | Redo / registers (vim)" },
  { keys: "Ctrl+S", description: "Forward-search command history" },
  { keys: "Ctrl+Z", description: "Suspend current process" },
  { keys: "Alt+B", description: "Move cursor backward one word" },
  { keys: "Alt+F", description: "Move cursor forward one word" },
  { keys: "Alt+D", description: "Delete next word" },
  { keys: "Alt+Backspace", description: "Delete previous word" },
]

const CONTROL_CHARACTERS_AND_SEQUENCES_MAPPINGS: Readonly<Record<string, string>> = {
  esc: CONTROL_CHARACTERS.escape,
  tab: CONTROL_CHARACTERS.tab,
  enter: CONTROL_CHARACTERS.carriageReturn,
  backspace: CONTROL_CHARACTERS.delete,
  up: CONTROL_SEQUENCES.cursorUp,
  down: CONTROL_SEQUENCES.cursorDown,
  left: CONTROL_SEQUENCES.cursorLeft,
  right: CONTROL_SEQUENCES.cursorRight,
}

/**
 * Parses a human-readable key name into the corresponding key, control character or sequence for the terminal.
 * This function handles normalization and a small set of key aliases (e.g. Esc, Enter, Tab, Backspace, arrows, Space).
 *
 * @param {string} key - The human-readable key name to parse.
 * @returns {string | null} The corresponding control character or sequence for the terminal, or null if the key is not recognized.
 */
function parseKey(key: string): string | null {
  const normalizedKey = key.trim().toLowerCase()

  if (!normalizedKey) {
    return null
  }

  if (normalizedKey === "space") {
    return " "
  }

  const controlCharacterOrSequenceKey = CONTROL_CHARACTERS_AND_SEQUENCES_MAPPINGS[normalizedKey]
  if (controlCharacterOrSequenceKey) {
    return controlCharacterOrSequenceKey
  }

  if (normalizedKey.length === 1) return normalizedKey

  return null
}

/**
 * Translates a human-readable keymap string (eg. "Ctrl+Alt+A", "Tab", "Esc") into the corresponding
 * control character(s) or sequence that should be sent to the terminal when that keymap is activated.
 *
 * This function handles normalization, flexible ordering of modifiers and keys, as well as resolution of key aliases.
 *
 * @param {string} keys - The human-readable keymap string to translate.
 * @returns {string | null} The corresponding control character(s) or sequence for the terminal or null.
 */
export function translateKeymaps(keys: string): string | null {
  const parts = keys
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  if (parts.length === 0) {
    return null
  }

  let useCtrl = false
  let useAlt = false
  let key = ""

  for (const part of parts) {
    if (part === "ctrl") {
      useCtrl = true
      continue
    }

    if (part === "alt") {
      useAlt = true
      continue
    }

    key = part
  }

  if (!key && parts.length === 1) {
    key = parts[0] ?? ""
  }

  const baseKey = parseKey(key)

  if (!baseKey) {
    return null
  }

  let result = baseKey

  if (useCtrl) {
    result = charToControlCharacter(result)
  }

  if (useAlt) {
    result = `${CONTROL_CHARACTERS.escape}${result}`
  }

  return result
}
