import { wrapSgr } from "@/lib/client/ansi"
import { getRemoteIPFromHeaders } from "./request-origin-resolver"
import { colorizeKeyPart, getColorForEvent, getColorForHttpStatus, getColorForLevel } from "./utils/logger-utils"

export type LogLevel = "error" | "warn" | "info" | "debug"
type LogValue = string | number | boolean | null | undefined | bigint | Error | Date
type LogFields = Record<string, LogValue>

export type Logger = {
  level: LogLevel
  isVerbose: boolean
  debug: (event: string, fields?: LogFields) => void
  info: (event: string, fields?: LogFields) => void
  warn: (event: string, fields?: LogFields) => void
  error: (event: string, fields?: LogFields) => void
}

/**
 * Logs an HTTP access line (debug level only).
 *
 * If `fallbackIp` is present, it will be used as a fallback for when no forwarding header is available.
 *
 * @param {Logger | undefined} logger Logger instance.
 * @param {Request} req Incoming request.
 * @param {number} status HTTP status code.
 * @param {number} startMs Start timestamp from `performance.now()`.
 * @param {string} reqId Unique request ID for correlation.
 * @param {string} [fallbackIp] Optional remote IP address from Bun's `server.requestIP`.
 * @param {string} [connId] Optional connection ID for correlation with WebSocket connections.
 */
export function logAccess(
  logger: Logger | undefined,
  req: Request,
  status: number,
  startMs: number,
  reqId: string,
  fallbackIp?: string,
  connId?: string,
): void {
  if (!logger || !logger.isVerbose) return

  const url = new URL(req.url)
  const ms = Math.max(0, performance.now() - startMs)

  const remoteIp = getRemoteIPFromHeaders(req.headers) ?? fallbackIp ?? "unknown"

  logger.debug("http_access", {
    method: req.method,
    path: url.pathname,
    status,
    ms: Math.round(ms),
    reqId,
    connId,
    remoteIp,
  })
}

/**
 * Quotes and escapes a string value if it contains whitespace or special characters.
 * Unquoted values must not contain whitespace or quotes/newlines according to logfmt rules.
 * Empty strings are also quoted for clarity.
 *
 * @param {string} raw - The raw string value to quote if needed.
 * @returns {string} The original string if no quoting is needed, or a quoted and escaped version if quoting is necessary.
 */
function quoteIfNeeded(raw: string): string {
  const needsQuote = raw.length === 0 || /[\s"\r\n\t]/.test(raw)

  if (!needsQuote) {
    return raw
  }

  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")

  return `"${escaped}"`
}

/**
 * Encodes a log value according to logfmt rules:
 *
 *  - null and undefined are represented as "null" and "undefined" strings.
 *  - Strings that contain whitespace or special characters are quoted and escaped.
 *  - Numbers, booleans, and bigints are converted to their string representation.
 *  - Dates are converted to ISO strings and quoted.
 *  - Errors are represented by their message (or name if message is empty) and quoted.
 *  - Other types are converted to strings and quoted as a fallback.
 *
 * @param {LogValue} v - The value to encode.
 * @returns {string} The logfmt-encoded string representation of the value.
 */
function encodeValue(v: LogValue): string {
  if (v === null) return "null"
  if (v === undefined) return "undefined"
  if (typeof v === "string") return quoteIfNeeded(v)
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (typeof v === "bigint") return quoteIfNeeded(v.toString())
  if (v instanceof Date) return quoteIfNeeded(v.toISOString())
  if (v instanceof Error) return quoteIfNeeded(v.message || v.name)
  return quoteIfNeeded(String(v))
}

/**
 * Converts an object of key-value pairs into a logfmt-formatted string.
 *
 * Undefined values are skipped, while null is represented as "null".
 * String values that contain whitespace or special characters are quoted and escaped as needed.
 *
 * @param {Record<string, LogValue>} obj The object containing key-value pairs to encode.
 * @param {{ colorKeys?: boolean }} [opts] Formatting options.
 * @returns {string} A logfmt-formatted string representing the input object.
 */
function logfmtLine(obj: Record<string, LogValue>, opts: { colorKeys?: boolean } = {}): string {
  const parts: string[] = []

  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue

    parts.push(`${colorizeKeyPart(k, opts.colorKeys)}${encodeValue(v)}`)
  }

  return parts.join(" ")
}

/**
 * Normalizes an error value for logging.
 * If the error is an instance of Error, it extracts the message and optionally the stack trace.
 * If the error is not an Error instance, it converts it to a string.
 *
 * @param {unknown} err - The error value to normalize.
 * @param {boolean} includeStack - Whether to include the stack trace if the error is an Error instance.
 * @returns {Record<string, LogValue>} An object containing the normalized error information.
 */
function normalizeErr(err: unknown, includeStack: boolean): Record<string, LogValue> {
  if (err instanceof Error) {
    const result: Record<string, LogValue> = { err: err.message || err.name }

    if (includeStack && err.stack) {
      result.err_stack = err.stack
    }

    return result
  }

  return { err: String(err) }
}

/**
 * Converts a string to snake_case.
 *
 * @param {string} key - The input string to convert.
 * @returns {string} The converted snake_case string.
 */
function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s.]+/g, "_")
    .toLowerCase()
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Determines if a log message should be logged based on the writer's command log level and the logger's configured log level.
 *
 * @param {LogLevel} writerCommandLogLevel - The log level of the message being logged.
 * @param {LogLevel} logerLevel - The configured log level of the logger instance.
 * @returns {boolean} - Returns true if the message should be logged, false otherwise.
 */
function shouldLog(writerCommandLogLevel: LogLevel, logerLevel: LogLevel): boolean {
  return LEVEL_ORDER[writerCommandLogLevel] >= LEVEL_ORDER[logerLevel]
}

/**
 * Creates a structured logger that outputs logfmt lines to stderr.
 * Supports log levels and optional stack traces for errors.
 *
 * By default, the log level is "info" (defaultLogLevel), but it can be set to "debug" (verboseLogLevel) via `--verbose`.
 * The logger automatically converts field keys to snake_case and includes a timestamp and event name.
 *
 * @param {Object} opts Logger options.
 * @param {LogLevel} [opts.defaultLogLevel] Log level when `verbose` is false (default: `info`).
 * @param {LogLevel} [opts.verboseLogLevel] Log level when `verbose` is true (Default: `debug`).
 * @param {LogLevel} [opts.level] Explicit log level to use (Overrides the default that is based on verbosity).
 * @param {boolean} [opts.verbose=false] Whether to use the verbose log level.
 * @return {Logger} Logger instance with methods for each log level.
 *
 * Example usage:
 *
 * ```
 * const log = createLogger({ verbose: true }) // sets level to "debug" and includes error stacks
 *
 * log.info("user_signup", { userId: 123, plan: "pro" })
 * log.error("payment_failed", { userId: 123, err: new Error("Card declined") })
 *
 * // Output:
 * // ts=2024-06-01T12:00:00.000Z lvl=info event=user_signup user_id=123 plan=pro
 * // ts=2024-06-01T12:01:00.000Z lvl=error event=payment_failed user_id=123 err="Card declined"
 * ```
 */
export function createLogger(
  opts: { defaultLogLevel?: LogLevel; verboseLogLevel?: LogLevel; level?: LogLevel; verbose?: boolean } = {},
): Logger {
  const { defaultLogLevel = "info", verboseLogLevel = "debug" } = opts
  const level: LogLevel = opts.level ?? (opts.verbose ? verboseLogLevel : defaultLogLevel)
  const useColor = Boolean(process.stderr.isTTY)

  function write(writerCommandLogLevel: LogLevel, event: string, fields: LogFields = {}): void {
    if (!shouldLog(writerCommandLogLevel, level)) return

    const includeStack = opts.verbose === true || level === "debug"

    // Extract err without duplicating
    const errAny = (fields as Record<string, unknown>).err
    const { err: _ignored, ...other } = fields as Record<string, unknown>

    // snake_case + stable ordering for "others"
    const otherFields: Record<string, LogValue> = {}
    for (const [k, v] of Object.entries(other)) {
      otherFields[toSnakeCase(k)] = v as LogValue
    }

    if (errAny !== undefined) {
      Object.assign(otherFields, normalizeErr(errAny, includeStack))
    }

    if (useColor && event.startsWith("http_")) {
      const httpStatusCode = (otherFields as Record<string, unknown>).status
      if (typeof httpStatusCode === "number") {
        otherFields.status = wrapSgr(getColorForHttpStatus(httpStatusCode), String(httpStatusCode))
      }
    }

    const orderedFields: Record<string, LogValue> = {
      ts: new Date().toISOString(),
      lvl: useColor ? wrapSgr(getColorForLevel(writerCommandLogLevel), writerCommandLogLevel) : writerCommandLogLevel,
      event: useColor ? wrapSgr(getColorForEvent(event), event) : event,
      ...Object.fromEntries(Object.entries(otherFields)),
    }

    // Always log to stderr to separate from any stdout output and to ensure logs are captured even if stdout is piped.
    process.stderr.write(`${logfmtLine(orderedFields, { colorKeys: useColor })}\n`)
  }

  return {
    level,
    isVerbose: level === verboseLogLevel,
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  }
}
