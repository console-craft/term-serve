import { SGR_SEQUENCES, wrapSgr } from "@/lib/client/ansi"
import type { LogLevel } from "@/lib/server/logger"

/**
 * Returns an SGR sequence for a log level.
 *
 * @param {LogLevel} level Log severity.
 * @returns {string | null} SGR sequence, or null for no styling.
 */
export function getColorForLevel(level: LogLevel): string | null {
  switch (level) {
    case "debug": {
      return SGR_SEQUENCES.blue
    }
    case "info": {
      return SGR_SEQUENCES.green
    }
    case "warn": {
      return SGR_SEQUENCES.yellow
    }
    case "error": {
      return SGR_SEQUENCES.red
    }
    default: {
      return null
    }
  }
}

/**
 * Returns an SGR sequence for an event category derived from its name.
 *
 * @param {string} event Event name.
 * @returns {string | null} SGR sequence, or null for no styling.
 */
export function getColorForEvent(event: string): string | null {
  if (event.startsWith("http_")) {
    return SGR_SEQUENCES.blue
  }

  if (event.startsWith("ws_")) {
    return SGR_SEQUENCES.cyan
  }

  if (event.startsWith("pty_")) {
    return SGR_SEQUENCES.green
  }

  return null
}

/**
 * Returns an SGR sequence for an HTTP status code.
 *
 * @param {number} status HTTP status code.
 * @returns {string | null} SGR sequence, or null for no styling.
 */
export function getColorForHttpStatus(status: number): string | null {
  if (!Number.isFinite(status)) {
    return null
  }

  if (status >= 100 && status <= 199) {
    return SGR_SEQUENCES.cyan
  }

  if (status >= 200 && status <= 299) {
    return SGR_SEQUENCES.green
  }

  if (status >= 300 && status <= 399) {
    return SGR_SEQUENCES.cyan
  }

  if (status >= 400 && status <= 499) {
    return SGR_SEQUENCES.yellow
  }

  if (status >= 500 && status <= 599) {
    return SGR_SEQUENCES.red
  }

  return null
}

/**
 * Wraps a string in an SGR sequence if colorization is enabled.
 *
 * @param {string} key String to wrap.
 * @param {string} shouldColorize SGR sequence to use for wrapping.
 * @returns {string} Wrapped string.
 */
export function colorizeKeyPart(key: string, shouldColorize?: boolean): string {
  const keyPart = `${key}=`
  return shouldColorize ? wrapSgr(SGR_SEQUENCES.brightBlack, keyPart) : keyPart
}
