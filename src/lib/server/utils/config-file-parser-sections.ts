import { ensureValidTerminalThemeId } from "@/lib/client/terminal-themes"
import type { Opts } from "@/types/core"
import type { Result } from "@/utils/safe-result"
import {
  asRecord,
  assertAllowedKeys,
  fail,
  parseBoolean,
  parseCommandArgv,
  parseFiniteNumber,
  parseNonEmptyString,
  parseTerminalFontSize,
} from "./config-file-parser-utils"

export type ParseState = {
  sawSectionHost: boolean
  sawSectionPort: boolean
  sawSectionAuthToken: boolean
  sawSectionTunnel: boolean
  sawAnyHost: boolean
  sawAnyPublic: boolean
}

/**
 * Parses the [server] section.
 *
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @param {ParseState} state Parse state accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseServerSection(
  rawValue: unknown,
  origin: string,
  opts: Partial<Opts>,
  state: ParseState,
): Result<void> {
  const [serverError, server] = asRecord(rawValue, origin, "[server] must be a table")
  if (serverError) {
    return [serverError, null]
  }

  const [serverKeysError] = assertAllowedKeys(server, new Set(["port", "host", "public", "tunnel"]), origin, "server")
  if (serverKeysError) {
    return [serverKeysError, null]
  }

  if (Object.hasOwn(server, "port")) {
    const [portError, port] = parseFiniteNumber(server.port, origin, "server.port")
    if (portError) {
      return [portError, null]
    }
    opts.port = port
    state.sawSectionPort = true
  }

  if (Object.hasOwn(server, "host")) {
    const [hostError, host] = parseNonEmptyString(server.host, origin, "server.host")
    if (hostError) {
      return [hostError, null]
    }
    opts.host = host
    state.sawSectionHost = true
    state.sawAnyHost = true
  }

  if (Object.hasOwn(server, "public")) {
    const [publicError, isPublic] = parseBoolean(server.public, origin, "server.public")
    if (publicError) {
      return [publicError, null]
    }
    opts.public = isPublic
    if (isPublic) {
      opts.host = "0.0.0.0"
    }
    state.sawAnyPublic = true
  }

  if (Object.hasOwn(server, "tunnel")) {
    const [tunnelError, tunnel] = parseBoolean(server.tunnel, origin, "server.tunnel")
    if (tunnelError) {
      return [tunnelError, null]
    }
    opts.tunnel = tunnel
    state.sawSectionTunnel = true
  }

  return [null, undefined]
}
/**
 * Parses the [auth] section.
 *
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @param {ParseState} state Parse state accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseAuthSection(
  rawValue: unknown,
  origin: string,
  opts: Partial<Opts>,
  state: ParseState,
): Result<void> {
  const [authError, auth] = asRecord(rawValue, origin, "[auth] must be a table")
  if (authError) {
    return [authError, null]
  }

  const [authKeysError] = assertAllowedKeys(auth, new Set(["auth_token"]), origin, "auth")
  if (authKeysError) {
    return [authKeysError, null]
  }

  if (Object.hasOwn(auth, "auth_token")) {
    const [authTokenError, authToken] = parseNonEmptyString(auth.auth_token, origin, "auth.auth_token")
    if (authTokenError) {
      return [authTokenError, null]
    }
    opts.authToken = authToken
    state.sawSectionAuthToken = true
  }

  return [null, undefined]
}

/**
 * Parses the [shell] section.
 *
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseShellSection(rawValue: unknown, origin: string, opts: Partial<Opts>): Result<void> {
  const [shellError, shell] = asRecord(rawValue, origin, "[shell] must be a table")
  if (shellError) {
    return [shellError, null]
  }

  const [shellKeysError] = assertAllowedKeys(shell, new Set(["cwd"]), origin, "shell")
  if (shellKeysError) {
    return [shellKeysError, null]
  }

  if (Object.hasOwn(shell, "cwd")) {
    const [cwdError, cwd] = parseNonEmptyString(shell.cwd, origin, "shell.cwd")
    if (cwdError) {
      return [cwdError, null]
    }
    opts.cwd = cwd
  }

  return [null, undefined]
}

/**
 * Parses the [terminal] section.
 *
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseTerminalSection(rawValue: unknown, origin: string, opts: Partial<Opts>): Result<void> {
  const [terminalError, terminal] = asRecord(rawValue, origin, "[terminal] must be a table")
  if (terminalError) {
    return [terminalError, null]
  }

  const [terminalKeysError] = assertAllowedKeys(terminal, new Set(["theme", "font", "font_size"]), origin, "terminal")
  if (terminalKeysError) {
    return [terminalKeysError, null]
  }

  if (Object.hasOwn(terminal, "theme")) {
    const [themeError, themeValue] = parseNonEmptyString(terminal.theme, origin, "terminal.theme")
    if (themeError) {
      return [themeError, null]
    }

    const [terminalThemeError, terminalTheme] = ensureValidTerminalThemeId(themeValue)
    if (terminalThemeError) {
      return [fail(origin, `terminal.theme: ${terminalThemeError.message}`), null]
    }
    opts.terminalTheme = terminalTheme
  }

  if (Object.hasOwn(terminal, "font")) {
    const [fontError, font] = parseNonEmptyString(terminal.font, origin, "terminal.font")
    if (fontError) {
      return [fontError, null]
    }
    opts.terminalFont = font
  }

  if (Object.hasOwn(terminal, "font_size")) {
    const [fontSizeError, fontSize] = parseTerminalFontSize(terminal.font_size, origin)
    if (fontSizeError) {
      return [fontSizeError, null]
    }
    opts.terminalFontSize = fontSize
  }

  return [null, undefined]
}

/**
 * Parses the [logging] section.
 *
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseLoggingSection(rawValue: unknown, origin: string, opts: Partial<Opts>): Result<void> {
  const [loggingError, logging] = asRecord(rawValue, origin, "[logging] must be a table")
  if (loggingError) {
    return [loggingError, null]
  }

  const [loggingKeysError] = assertAllowedKeys(logging, new Set(["verbose"]), origin, "logging")
  if (loggingKeysError) {
    return [loggingKeysError, null]
  }

  if (Object.hasOwn(logging, "verbose")) {
    const [verboseError, verbose] = parseBoolean(logging.verbose, origin, "logging.verbose")
    if (verboseError) {
      return [verboseError, null]
    }
    opts.verbose = verbose
  }

  return [null, undefined]
}

/**
 * Parses the [command] section.
 *
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseCommandSection(rawValue: unknown, origin: string, opts: Partial<Opts>): Result<void> {
  const [commandError, command] = asRecord(rawValue, origin, "[command] must be a table")
  if (commandError) {
    return [commandError, null]
  }

  const [commandKeysError] = assertAllowedKeys(command, new Set(["argv"]), origin, "command")
  if (commandKeysError) {
    return [commandKeysError, null]
  }

  if (Object.hasOwn(command, "argv")) {
    const [argvError, argv] = parseCommandArgv(command.argv, origin)
    if (argvError) {
      return [argvError, null]
    }
    opts.commandToRun = argv[0]
    opts.commandArgs = argv.slice(1)
  }

  return [null, undefined]
}
