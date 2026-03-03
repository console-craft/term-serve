import type { Result } from "@/utils/safe-result"

/**
 * Creates a config error with an origin-prefixed message.
 *
 * @param {string} origin Config origin string.
 * @param {string} message Error detail message.
 * @returns {Error} Origin-prefixed config error.
 */
export function fail(origin: string, message: string): Error {
  return new Error(`${origin}: ${message}`)
}

/**
 * Checks whether a value is a plain object record.
 *
 * @param {unknown} value Candidate value.
 * @returns {value is Record<string, unknown>} True when value is a plain object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Casts a value to record form when it is a TOML table.
 *
 * @param {unknown} value Candidate value.
 * @param {string} origin Config origin string.
 * @param {string} message Error message on mismatch.
 * @returns {Result<Record<string, unknown>>} Record value or error.
 */
export function asRecord(value: unknown, origin: string, message: string): Result<Record<string, unknown>> {
  if (!isRecord(value)) {
    return [fail(origin, message), null]
  }
  return [null, value]
}

/**
 * Validates section keys against an allowlist.
 *
 * @param {Record<string, unknown>} section Section table.
 * @param {Set<string>} allowed Allowed keys for the section.
 * @param {string} origin Config origin string.
 * @param {string} sectionName Section name.
 * @returns {Result<void>} Success or parse error.
 */
export function assertAllowedKeys(
  section: Record<string, unknown>,
  allowed: Set<string>,
  origin: string,
  sectionName: string,
): Result<void> {
  for (const key of Object.keys(section)) {
    if (!allowed.has(key)) {
      return [fail(origin, `Unknown key in [${sectionName}]: ${key}`), null]
    }
  }
  return [null, undefined]
}

/**
 * Validates that a value is a finite number.
 *
 * @param {unknown} value Candidate value.
 * @param {string} origin Config origin string.
 * @param {string} key Config key path.
 * @returns {Result<number>} Parsed number or error.
 */
export function parseFiniteNumber(value: unknown, origin: string, key: string): Result<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [fail(origin, `${key} must be a finite number`), null]
  }
  return [null, value]
}

/**
 * Validates that a value is a non-empty string.
 *
 * @param {unknown} value Candidate value.
 * @param {string} origin Config origin string.
 * @param {string} key Config key path.
 * @returns {Result<string>} Parsed string or error.
 */
export function parseNonEmptyString(value: unknown, origin: string, key: string): Result<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [fail(origin, `${key} must be a non-empty string`), null]
  }
  return [null, value]
}

/**
 * Validates that a value is a boolean.
 *
 * @param {unknown} value Candidate value.
 * @param {string} origin Config origin string.
 * @param {string} key Config key path.
 * @returns {Result<boolean>} Parsed boolean or error.
 */
export function parseBoolean(value: unknown, origin: string, key: string): Result<boolean> {
  if (typeof value !== "boolean") {
    return [fail(origin, `${key} must be a boolean`), null]
  }
  return [null, value]
}

/**
 * Parses terminal font_size into CLI-compatible string format.
 *
 * @param {unknown} value Candidate value.
 * @param {string} origin Config origin string.
 * @returns {Result<string>} Font size string for CLI opts or error.
 */
export function parseTerminalFontSize(value: unknown, origin: string): Result<string> {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return [fail(origin, "terminal.font_size must be a positive number or [positive, positive]"), null]
    }
    return [null, String(value)]
  }

  if (Array.isArray(value) && value.length === 2) {
    const [desktop, mobile] = value
    if (typeof desktop !== "number" || typeof mobile !== "number") {
      return [fail(origin, "terminal.font_size must be a positive number or [positive, positive]"), null]
    }

    if (!Number.isFinite(desktop) || !Number.isFinite(mobile) || desktop <= 0 || mobile <= 0) {
      return [fail(origin, "terminal.font_size must be a positive number or [positive, positive]"), null]
    }
    return [null, `${desktop},${mobile}`]
  }

  return [fail(origin, "terminal.font_size must be a positive number or [positive, positive]"), null]
}

/**
 * Parses command argv into command + args form.
 *
 * @param {unknown} value Candidate value.
 * @param {string} origin Config origin string.
 * @returns {Result<string[]>} Parsed argv or error.
 */
export function parseCommandArgv(value: unknown, origin: string): Result<string[]> {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    return [fail(origin, "command.argv must be a non-empty array of strings"), null]
  }
  return [null, value]
}
