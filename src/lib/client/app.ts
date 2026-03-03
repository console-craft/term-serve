import { getAuthTokenIfRequired } from "./auth"
import { setupCopyButtons } from "./clipboard"
import { fetchServerConfig } from "./config"
import { setupKeymapsPalette } from "./keymaps-palette-ui"
import { setupMobileGutterScroll } from "./mobile-scroll"
import { handleMobileKeyboardToggle, handleSyncTerminalSizeToContainer, handleViewportResize } from "./resize"
import { createTerminal } from "./terminal"

import {
  setTitlebarAddress,
  setupPreventStartupAutoFocus,
  setupSwitchKeysButton,
  setupToolbarTerminalFocus,
} from "./terminal-ui"
import {
  connect,
  createSendInputToServer,
  handleSendNewSizeToServer,
  handleSendTerminalInputToServer,
  setupSendKeysButtonsToServer,
} from "./websockets"

/**
 * Runs the client bootstrap sequence.
 *
 * @returns {Promise<void>} A promise that resolves when bootstrap succeeds.
 * @throws {Error} If any startup dependency fails.
 */
async function main(): Promise<void> {
  const [configError, serverConfig] = await fetchServerConfig()
  if (configError) {
    throw configError
  }

  const [terminalError, term] = await createTerminal({
    terminalFont: serverConfig.terminalFont,
    terminalFontSize: serverConfig.terminalFontSize,
    terminalTheme: serverConfig.terminalTheme,
  })
  if (terminalError) {
    throw terminalError
  }

  setupPreventStartupAutoFocus(term)
  setTitlebarAddress()
  handleViewportResize()
  handleSyncTerminalSizeToContainer(term)
  setupCopyButtons(term)
  setupSwitchKeysButton()
  setupToolbarTerminalFocus(term)
  handleMobileKeyboardToggle(term)
  setupMobileGutterScroll(term)

  const authToken = await getAuthTokenIfRequired()
  const [socketError, ws] = connect(term, {
    authToken,
    ptyCwd: serverConfig.ptyCwd,
    ptyMode: serverConfig.ptyMode,
    ptyCommand: serverConfig.ptyCommand,
  })
  if (socketError) {
    throw socketError
  }

  const SendKeys = setupSendKeysButtonsToServer(ws, term)

  handleSendTerminalInputToServer(ws, term, SendKeys)
  handleSendNewSizeToServer(ws, term)
  setupKeymapsPalette(term, createSendInputToServer(ws, term))
}

/**
 * Runs the app entrypoint and handles top-level startup errors.
 *
 * @returns {Promise<void>} A promise that resolves when startup attempt completes.
 */
async function run(): Promise<void> {
  try {
    await main()
  } catch (startupError: unknown) {
    console.error(startupError)
  }
}

void run()
