/// <reference lib="dom" />

import { Ghostty, Terminal } from "ghostty-web"
import { asAsyncResult, asResult, type Result } from "@/utils/safe-result"
import { getFontFamily, getFontSize, preloadTerminalFonts } from "./terminal-fonts"
import { applyTerminalContainerBackground, resolveTerminalTheme } from "./terminal-themes"
import { getElement } from "./utils"

/**
 * Creates and configures a ghostty-web terminal instance, including loading the WebAssembly module, setting terminal options, and mounting it in the DOM.
 *
 * @returns {Promise<Result<Terminal>>} A promise that resolves to either an error or the created Terminal instance.
 */
export async function createTerminal(opts: {
  terminalFont?: string
  terminalFontSize?: string
  terminalTheme?: string
}): Promise<Result<Terminal>> {
  // Load Ghostty WebAssembly module.
  const [ghosttyError, ghostty] = await asAsyncResult(() => Ghostty.load("/ghostty-vt.wasm"))
  if (ghosttyError) {
    return [ghosttyError, null]
  }

  // Preload fonts to avoid rendering issues on first load.
  await preloadTerminalFonts(opts.terminalFontSize, opts.terminalFont)

  // Create a ghostty-web terminal and mount it in the DOM.
  const container = getElement("#terminal")

  // Set a theme if provided and valid.
  const theme = resolveTerminalTheme(opts.terminalTheme)
  applyTerminalContainerBackground(container, theme)

  const [termError, term] = asResult(
    () =>
      new Terminal({
        ghostty,
        allowTransparency: true,
        fontFamily: getFontFamily(opts.terminalFont),
        fontSize: getFontSize(window.innerWidth, opts.terminalFontSize),
        cursorBlink: true,
        cols: 80,
        rows: 24,
        ...(theme ? { theme } : {}),
      }),
  )
  if (termError) {
    return [termError, null]
  }

  const [openError] = asResult(() => term.open(container))
  if (openError) {
    return [openError, null]
  }

  return [null, term]
}
