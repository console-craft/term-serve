/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { KEYMAPS, type KeymapsPaletteItem, translateKeymaps } from "./keymaps-palette"
import { focusTerminalInput } from "./terminal-ui"
import { getClickedButton, getElement } from "./utils"

/**
 * Filters the list of keymap items based on the provided query string.
 * The filtering is case-insensitive and checks if the query is included in either the key sequence or the description of each item.
 *
 * @param {string} query The search query to filter the keymap items.
 * @returns {ReadonlyArray<KeymapsPaletteItem>} A filtered array of `KeymapsPaletteItem` objects that match the search query. If the query is empty, it returns the full list.
 */
function getFilteredItems(query: string): ReadonlyArray<KeymapsPaletteItem> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return KEYMAPS

  return KEYMAPS.filter((item) => {
    const haystack = `${item.keys} ${item.description}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

/**
 * Renders the list of keymaps in the keymaps palette based on the provided items.
 * It also toggles the visibility of the empty state element based on whether there are items to display.
 *
 * @param {ReadonlyArray<KeymapsPaletteItem>} items The list of keymap items to render.
 * @param {HTMLElement} list The container element where the keymap items should be rendered.
 * @param {HTMLElement} empty The element to show when there are no items to display, which should be hidden when there are items to render.
 */
function renderList(items: ReadonlyArray<KeymapsPaletteItem>, list: HTMLElement, empty: HTMLElement): void {
  list.textContent = ""
  empty.classList.toggle("hidden", items.length > 0)

  const fragment = document.createDocumentFragment()

  for (const item of items) {
    const row = document.createElement("li")
    row.className = "keymaps-palette-row"

    const button = document.createElement("button")
    button.type = "button"
    button.className = "keymaps-palette-item"
    button.dataset.sequence = item.keys

    const sequence = document.createElement("span")
    sequence.className = "keymaps-palette-sequence"
    sequence.textContent = item.keys

    const description = document.createElement("span")
    description.className = "keymaps-palette-description"
    description.textContent = item.description

    button.append(sequence, description)
    row.appendChild(button)
    fragment.appendChild(row)
  }

  list.appendChild(fragment)
}

/**
 * Closes the keymaps palette and focuses the terminal input for continued user interaction.
 *
 * @param {HTMLElement} modal The palette modal element to hide.
 * @param {Terminal} term The terminal instance to focus after closing the palette.
 */
function closePalette(modal: HTMLElement, term: Terminal): void {
  modal.classList.add("hidden")
  focusTerminalInput(term)
}

/**
 * Opens the keymaps palette, resets the input field, renders the full list of keymaps, and focuses the input for user interaction.
 *
 * @param {HTMLElement} modal The palette modal element to show.
 * @param {HTMLInputElement} input The input field to reset and focus.
 * @param {HTMLElement} list The list element to render the keymaps into.
 * @param {HTMLElement} empty The element to show when the list is empty, which should be hidden when the palette is opened with the full list of keymaps.
 */
function openPalette(modal: HTMLElement, input: HTMLInputElement, list: HTMLElement, empty: HTMLElement): void {
  modal.classList.remove("hidden")
  input.value = ""
  renderList(KEYMAPS, list, empty)
  input.focus()
}

/**
 * Sets up the keymaps palette, including event listeners for opening/closing the palette, filtering the list based on user input, and sending the selected key sequence to the server.
 *
 * @param {Terminal} term The terminal instance to focus when the palette is closed.
 * @param {(input: string) => void} sendInput A function to send the selected key sequence to the server.
 */
export function setupKeymapsPalette(term: Terminal, sendInput: (input: string) => void): void {
  const openButton = getElement(".keymaps-palette-button")
  const modal = getElement(".keymaps-palette")
  const input = getElement(".keymaps-palette-input") as HTMLInputElement
  const list = getElement(".keymaps-palette-list")
  const empty = getElement(".keymaps-palette-empty")

  openButton.addEventListener("click", (event) => {
    event.preventDefault()
    openPalette(modal, input, list, empty)
  })

  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return
    closePalette(modal, term)
  })

  input.addEventListener("input", () => {
    renderList(getFilteredItems(input.value), list, empty)
  })

  list.addEventListener("click", (event) => {
    const button = getClickedButton(event)
    if (!button) return

    const sequence = button.dataset.sequence
    if (!sequence) return

    const translated = translateKeymaps(sequence)
    if (!translated) return

    sendInput(translated)
    closePalette(modal, term)
  })

  // Use capture so we can intercept before the terminal consumes shortcuts.
  document.addEventListener(
    "keydown",
    (event) => {
      const paletteOpen = !modal.classList.contains("hidden")

      if (paletteOpen && (event.key === "Escape" || event.key === "Esc")) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        closePalette(modal, term)
        return
      }

      // Some browsers intercept Escape (e.g. Stop loading). Provide an alternate close shortcut.
      if (
        paletteOpen &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        (event.code === "KeyC" || event.key.toLowerCase() === "c")
      ) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        closePalette(modal, term)
        return
      }

      const isOpenShortcut =
        event.ctrlKey && event.altKey && !event.metaKey && (event.code === "KeyK" || event.key.toLowerCase() === "k")

      if (!isOpenShortcut) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      openPalette(modal, input, list, empty)
    },
    { capture: true },
  )

  renderList(KEYMAPS, list, empty)
}
