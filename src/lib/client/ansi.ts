/*
 * - Control characters (single byte): eg. `\x1b` (escape), `\x09` (tab), `\x03` (Ctrl+C), `\x0d` (CR), `\x0a` (LF)
 * - Escape sequences (`\x1b` + `[` + ...): eg. control sequences, SGR sequences
 * - Control Sequences(`\x1b` + `[` + params): eg. `\x1b[A` (cursor up), `\x1b[B` (cursor down)
 * - SGR Sequences (control sequence + `m`): eg. `\x1b[31m` (red), `\x1b[1m` (bold)
 */

export const CONTROL_CHARACTERS = {
  nul: "\x00",
  tab: "\t",
  carriageReturn: "\r",
  ctrlA: "\x01",
  ctrlB: "\x02",
  ctrlC: "\x03",
  ctrlD: "\x04",
  ctrlE: "\x05",
  ctrlF: "\x06",
  ctrlH: "\x08",
  ctrlJ: "\x0a",
  ctrlK: "\x0b",
  ctrlL: "\x0c",
  ctrlN: "\x0e",
  ctrlP: "\x10",
  ctrlU: "\x15",
  ctrlW: "\x17",
  ctrlY: "\x19",
  escape: "\x1b",
  fileSeparator: "\x1c",
  groupSeparator: "\x1d",
  recordSeparator: "\x1e",
  unitSeparator: "\x1f",
  delete: "\x7f",
}

export const CONTROL_SEQUENCES = {
  cursorUp: "\x1b[A",
  cursorDown: "\x1b[B",
  cursorRight: "\x1b[C",
  cursorLeft: "\x1b[D",
}

export const SGR_SEQUENCES = {
  black: "\x1b[30m",
  brightBlack: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  defaultFg: "\x1b[39m",
  defaultBg: "\x1b[49m",
  bold: "\x1b[1m",
  noBold: "\x1b[22m",
  noItalic: "\x1b[23m",
  noUnderline: "\x1b[24m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  reset: "\x1b[0m",
}

const CRLF = "\r\n"

/**
 * Wraps a string with an SGR color sequence and a trailing reset.
 * When `sgr` is null, the string is returned unchanged.
 *
 * @param {string | null} sgr ANSI SGR prefix sequence.
 * @param {string} text Text to wrap.
 * @returns {string} Colored text with reset (or original text).
 */
export function wrapSgr(sgr: string | null, text: string): string {
  if (!sgr) {
    return text
  }

  return `${sgr}${text}${SGR_SEQUENCES.reset}`
}

/**
 * Returns true when the input is a single printable ASCII character (not including control characters).
 *
 * @param {string} input The input to check.
 * @returns {boolean} True when the input is a single printable ASCII character.
 */
export function isPrintableAsciiChar(input: string): boolean {
  if (input.length !== 1) {
    return false
  }

  const code = input.charCodeAt(0)

  return code >= 0x20 && code !== 0x7f
}

/**
 * Returns true when the input is an Enter key that would submit the current line.
 *
 * @param {string} input The exact bytes that would be sent to the PTY.
 * @returns {boolean} True when the input is an Enter key.
 */
export function isUserEnterKey(input: string): boolean {
  return input === CONTROL_CHARACTERS.carriageReturn || input === CONTROL_CHARACTERS.ctrlJ
}

/**
 * Returns a message of the day (MOTD) string (eg. include a tip for users on how to open the Send Keys palette).
 *
 * @returns {string} The formatted MOTD string.
 */
export function getMotd(): string {
  const color = SGR_SEQUENCES.green
  const reset = SGR_SEQUENCES.reset
  const bold = SGR_SEQUENCES.bold
  const noBold = SGR_SEQUENCES.noBold
  const newLine = CRLF

  return `${newLine}${color}TIP: ${bold}Ctrl+Alt+K${noBold} - open keymaps palette${reset}${newLine}`
}

/**
 * Returns a short status line used when the server is running in command mode.
 *
 * @param {string | undefined} commandLine Human-readable command line to display.
 * @returns {string} The formatted running-command message.
 */
export function getRunningCommandMessage(cwd?: string, commandLine?: string): string {
  const color = SGR_SEQUENCES.yellow
  const reset = SGR_SEQUENCES.reset
  const bold = SGR_SEQUENCES.bold
  const noBold = SGR_SEQUENCES.noBold
  const newLine = CRLF

  const dir = cwd ? `→ ${cwd}` : ""
  const cmd = (commandLine ?? "").replaceAll("\r", " ").replaceAll("\n", " ").trim()
  const command = cmd ? `Running command ${JSON.stringify(cmd)} …` : "Running command …"

  return `${newLine}${color}${bold}${dir}${newLine}${command}${noBold}${reset}${newLine}${newLine}`
}

/**
 * Returns a banner string that will be displayed in the terminal when the user connects.
 *
 * @returns {string} The formatted banner string.
 */
export function getBanner(): string {
  const color = SGR_SEQUENCES.defaultFg
  const reset = SGR_SEQUENCES.reset
  const newLine = CRLF

  return (
    `${newLine}${color}───────────────────────────────────────────────────────────────────────────────${reset}${newLine}${newLine}` +
    `${color}████████╗███████╗██████╗ ███╗   ███╗  ███████╗███████╗██████╗ ██╗   ██╗███████╗${reset}${newLine}` +
    `${color}╚══██╔══╝██╔════╝██╔══██╗████╗ ████║  ██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝${reset}${newLine}` +
    `${color}   ██║   █████╗  ██████╔╝██╔████╔██║  ███████╗█████╗  ██████╔╝██║   ██║█████╗  ${reset}${newLine}` +
    `${color}   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║  ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ${reset}${newLine}` +
    `${color}   ██║   ███████╗██║  ██║██║ ╚═╝ ██║  ███████║███████╗██║  ██║ ╚████╔╝ ███████╗${reset}${newLine}` +
    `${color}   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝${reset}${newLine}` +
    `${newLine}${color}───────────────────────────────────────────────────────────────────────────────${reset}${newLine}${newLine}`
  )
}

/**
 * Returns a formatted message indicating that the connection has been closed.
 *
 * @returns {string} The formatted disconnection message.
 */
export function getDisconnectedMessage(): string {
  const color = SGR_SEQUENCES.defaultFg
  const reset = SGR_SEQUENCES.reset
  const bold = SGR_SEQUENCES.bold
  const newLine = CRLF

  return `${newLine}${color}${bold}Connection closed: Disconnected.${reset}${newLine}`
}

/**
 * Returns a formatted message indicating an error.
 *
 * @returns {string} The formatted error message.
 */
export function getErrorMessage(): string {
  const color = SGR_SEQUENCES.red
  const reset = SGR_SEQUENCES.reset
  const bold = SGR_SEQUENCES.bold
  const newLine = CRLF

  return `${newLine}${newLine}${color}${bold}Connection closed: Server Error.${reset}${newLine}`
}
