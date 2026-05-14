import type { Opts } from "@/types/core"
import type { Result } from "@/utils/safe-result"
import {
  type ParseState,
  parseAuthSection,
  parseCommandSection,
  parseLoggingSection,
  parseServerSection,
  parseShellSection,
  parseTerminalSection,
} from "./utils/config-file-parser-sections"
import {
  asRecord,
  fail,
  isRecord,
  parseBoolean,
  parseFiniteNumber,
  parseNonEmptyString,
} from "./utils/config-file-parser-utils"

/**
 * Parses one supported top-level section table.
 *
 * @param {string} sectionName Name of the section being parsed.
 * @param {unknown} rawValue Raw section value.
 * @param {string} origin Config origin string.
 * @param {Partial<Opts>} opts Parsed options accumulator.
 * @param {ParseState} state Parse state accumulator.
 * @returns {Result<void>} Success or parse error.
 */
export function parseSection(
  sectionName: string,
  rawValue: unknown,
  origin: string,
  opts: Partial<Opts>,
  state: ParseState,
): Result<void> {
  if (sectionName === "server") {
    return parseServerSection(rawValue, origin, opts, state)
  }

  if (sectionName === "auth") {
    return parseAuthSection(rawValue, origin, opts, state)
  }

  if (sectionName === "shell") {
    return parseShellSection(rawValue, origin, opts)
  }

  if (sectionName === "terminal") {
    return parseTerminalSection(rawValue, origin, opts)
  }

  if (sectionName === "logging") {
    return parseLoggingSection(rawValue, origin, opts)
  }

  return parseCommandSection(rawValue, origin, opts)
}

const TOP_LEVEL_TABLES = new Set(["server", "auth", "shell", "terminal", "logging", "command"])

/**
 * Parses and validates a TOML config object into CLI options.
 *
 * @param {unknown} obj Parsed TOML object.
 * @param {string} origin Config origin string used in error messages.
 * @returns {Result<Partial<Opts>>} Parsed options from config or an error.
 */
export function parseConfigObject(obj: unknown, origin: string): Result<Partial<Opts>> {
  const [rootError, root] = asRecord(obj, origin, "Config root must be a TOML table")
  if (rootError) {
    return [rootError, null]
  }

  const opts: Partial<Opts> = {}
  const state: ParseState = {
    sawSectionHost: false,
    sawSectionPort: false,
    sawSectionAuthToken: false,
    sawSectionTunnel: false,
    sawAnyHost: false,
    sawAnyPublic: false,
  }

  let sawFlatHost = false
  let sawFlatPort = false
  let sawFlatAuthToken = false
  let sawFlatTunnel = false

  for (const [key, rawValue] of Object.entries(root)) {
    if (key === "host") {
      const [hostError, host] = parseNonEmptyString(rawValue, origin, "host")
      if (hostError) {
        return [hostError, null]
      }
      opts.host = host
      sawFlatHost = true
      state.sawAnyHost = true
      continue
    }

    if (key === "port") {
      const [portError, port] = parseFiniteNumber(rawValue, origin, "port")
      if (portError) {
        return [portError, null]
      }
      opts.port = port
      sawFlatPort = true
      continue
    }

    if (key === "auth_token") {
      const [authTokenError, authToken] = parseNonEmptyString(rawValue, origin, "auth_token")
      if (authTokenError) {
        return [authTokenError, null]
      }
      opts.authToken = authToken
      sawFlatAuthToken = true
      continue
    }

    if (key === "tunnel") {
      const [tunnelError, tunnel] = parseBoolean(rawValue, origin, "tunnel")
      if (tunnelError) {
        return [tunnelError, null]
      }
      opts.tunnel = tunnel
      sawFlatTunnel = true
      continue
    }

    if (!TOP_LEVEL_TABLES.has(key)) {
      if (isRecord(rawValue)) {
        return [fail(origin, `Unknown top-level section: [${key}]`), null]
      }
      return [fail(origin, `Unknown top-level key: ${key}`), null]
    }

    const [sectionError] = parseSection(key, rawValue, origin, opts, state)
    if (sectionError) {
      return [sectionError, null]
    }
  }

  if (sawFlatPort && state.sawSectionPort) {
    return [fail(origin, 'Duplicate key representation for "port": use either top-level "port" or [server].port'), null]
  }

  if (sawFlatHost && state.sawSectionHost) {
    return [fail(origin, 'Duplicate key representation for "host": use either top-level "host" or [server].host'), null]
  }

  if (sawFlatAuthToken && state.sawSectionAuthToken) {
    return [
      fail(
        origin,
        'Duplicate key representation for "auth_token": use either top-level "auth_token" or [auth].auth_token',
      ),
      null,
    ]
  }

  if (sawFlatTunnel && state.sawSectionTunnel) {
    return [
      fail(origin, 'Duplicate key representation for "tunnel": use either top-level "tunnel" or [server].tunnel'),
      null,
    ]
  }

  if (state.sawAnyHost && state.sawAnyPublic) {
    return [fail(origin, 'Conflicting bind intent: "host" and "public" cannot both be present in config'), null]
  }

  return [null, opts]
}
