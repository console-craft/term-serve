import type { Terminal } from "ghostty-web"
import { asResult, type Result } from "@/utils/safe-result"
import { getBanner, getDisconnectedMessage, getErrorMessage, getMotd, getRunningCommandMessage } from "./ansi"
import { createSendKeysController, type SendKeysController } from "./key-sequences"
import { createShellCloseConfirmController } from "./shell-close-confirm"
import { setStatus } from "./terminal-ui"

/**
 * Writes startup messages to the terminal right before the WebSocket connection lifecycle starts.
 *
 * @param {Terminal} term The terminal instance receiving startup output.
 * @param {{ ptyCwd?: string; ptyMode?: "shell" | "command"; ptyCommand?: string }} opts Connection metadata used to format command-mode intro text.
 * @returns {void}
 */
function writeConnectionIntro(
  term: Terminal,
  opts: { ptyCwd?: string; ptyMode?: "shell" | "command"; ptyCommand?: string },
): void {
  term.write(getBanner())

  if (opts.ptyMode === "command") {
    term.write(getRunningCommandMessage(opts.ptyCwd, opts.ptyCommand))
    return
  }

  term.write(getMotd())
}

/**
 * Wires WebSocket lifecycle handlers to synchronize terminal output and UI status.
 *
 * @param {WebSocket} ws The WebSocket connection to wire.
 * @param {Terminal} term The terminal instance to update from websocket events.
 * @returns {void}
 */
function wireConnectionHandlers(ws: WebSocket, term: Terminal): void {
  ws.onopen = () => {
    setStatus("connected", "Connected")
  }

  // Server sends strings (UTF-8 decoded PTY output) that we write to the browser terminal.
  ws.onmessage = (event) => {
    term.write(event.data)
  }

  // Browsers commonly emit `error` and then immediately `close` for failed handshakes / network issues.
  // If we always set "Disconnected" on close, it will overwrite the error state and the error state will never be shown.
  // We use the `hasError` flag to track if an error occurred, so we can set the correct status in the `onclose` handler.
  let hasError = false

  ws.onerror = () => {
    hasError = true
  }

  ws.onclose = (event) => {
    // Some environments may invoke `onclose` without an event object.
    // We treat those as normal disconnects.
    if (!event) {
      setStatus("disconnected", "Disconnected")
      term.write(getDisconnectedMessage())
      return
    }

    // Some failures only surface as an abnormal close (often code 1006) without an explicit `error` event.
    // We treat those as errors as well.
    const abnormalClose = event.code !== 1000 && event.code !== 1001

    if (hasError || !event.wasClean || abnormalClose) {
      setStatus("error", "Server Error")
      term.write(getErrorMessage())
      return
    }

    setStatus("disconnected", "Disconnected")
    term.write(getDisconnectedMessage())
  }
}

/**
 * Establishes a WebSocket connection to the server and sets up event handlers for connection status, incoming messages, and errors.
 * On initialization it also writes some info messages to the terminal (banner and MOTD, or command-mode status).
 *
 * @param {Terminal} term The terminal instance that will display server output.
 * @param {{ authToken?: string; ptyCwd?: string; ptyMode?: "shell" | "command"; ptyCommand?: string }} opts Optional connection options.
 * @returns {Result<WebSocket>} A tuple containing either an error or the established WebSocket.
 */
export function connect(
  term: Terminal,
  opts: { authToken?: string; ptyCwd?: string; ptyMode?: "shell" | "command"; ptyCommand?: string } = {},
): Result<WebSocket> {
  // Open WebSocket connection to server. URL includes initial cols/rows that the server uses for PTY size.
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const tokenParam = opts.authToken ? `&token=${encodeURIComponent(opts.authToken)}` : ""
  const [socketError, ws] = asResult(
    () => new WebSocket(`${protocol}//${location.host}/ws?cols=${term.cols}&rows=${term.rows}${tokenParam}`),
  )
  if (socketError) {
    return [socketError, null]
  }

  writeConnectionIntro(term, opts)
  wireConnectionHandlers(ws, term)

  return [null, ws]
}

/**
 * Wires the toolbar Send Keys buttons to send parsed input to the server via the provided WebSocket.
 *
 * NOTE: This is responsible only for toolbar button clicks and sticky modifier state, not for typed raw terminal input.
 * You can use the returned controller to manually transform typed raw terminal input before sending to the server.
 *
 * @param {WebSocket} ws The WebSocket connection to the server.
 * @param {Terminal} term The terminal instance to proxy to createInputToServer, needed for shell close confirmation.
 * @returns {SendKeysController} A controller that can transform typed input using sticky modifiers.
 */
export function setupSendKeysButtonsToServer(ws: WebSocket, term: Terminal): SendKeysController {
  const sendInput = createSendInputToServer(ws, term)

  // Create and return a Send Keys controller.
  return createSendKeysController(
    // Provide callback to be used when a toolbar button is clicked, to send the parsed input to the server.
    (input) => {
      sendInput(input)
    },
  )
}

/**
 * Returns a function that can be used to send raw input to the server via the provided WebSocket.
 *
 * It includes a confirmation prompt for potentially dangerous inputs that could lead to accidental shell exits
 * (e.g. "exit" + Enter, or Ctrl+D on an empty prompt) based on heuristics about the current terminal state and line input.
 *
 * @param {WebSocket} ws The WebSocket connection to the server.
 * @param {Terminal} term The terminal instance to use for shell close confirmation.
 * @returns {(input: string) => void} A function that sends the given input to the server, after confirming with the user if needed.
 */
export function createSendInputToServer(ws: WebSocket, term: Terminal): (input: string) => void {
  const ConfirmController = createShellCloseConfirmController(term)

  return (input: string) => {
    if (ws.readyState !== WebSocket.OPEN) return
    if (!ConfirmController.confirmBeforeSend(input)) return

    ws.send(input)

    ConfirmController.saveSent(input)
  }
}

/**
 * Wires parsing raw user input typed in the terminal, before sending it to the server via the provided WebSocket.
 * It uses the provided Send Keys controller's `parseInput` helper to apply any active sticky Ctrl/Alt modifiers.
 *
 * @param {WebSocket} ws The WebSocket connection to the server.
 * @param {Terminal} term The terminal instance to proxy to createInputToServer, needed for shell close confirmation.
 * @param {SendKeysController} sendKeys Controller that transforms typed input using sticky modifiers.
 */
export function handleSendTerminalInputToServer(ws: WebSocket, term: Terminal, sendKeys: SendKeysController): void {
  const sendInput = createSendInputToServer(ws, term)

  term.onData((data) => {
    sendInput(sendKeys.parseInput(data))
  })
}

/**
 * Sets up an event listener on the terminal to send the new size to the server via WebSocket whenever the terminal is resized.
 *
 * @param {WebSocket} ws - The WebSocket connection to send the new size information through.
 * @param {Terminal} term - The terminal instance to listen for resize events on.
 */
export function handleSendNewSizeToServer(ws: WebSocket, term: Terminal): void {
  term.onResize(({ cols, rows }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols, rows }))
    }
  })
}
