/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { CONTROL_CHARACTERS, isPrintableAsciiChar, isUserEnterKey } from "./ansi"
import { isNormalScreen } from "./utils"

export type ShellCloseConfirmController = {
  /**
   * Returns true when the given input should be sent to the PTY.
   * When this returns false, the caller must not send the input (and must not update controller state).
   *
   * @param {string} input The exact bytes that would be sent to the PTY.
   * @returns {boolean} True when allowed.
   */
  confirmBeforeSend: (input: string) => boolean

  /**
   * Updates internal line-tracking based on input that was actually sent to the PTY.
   *
   * @param {string} input The exact bytes that were sent to the PTY.
   */
  saveSent: (input: string) => void
}

type LineState = {
  value: string
  reliable: boolean
}

/**
 * Updates a best-effort model of the current shell input line.
 *
 * NOTE: This is intentionally conservative. As soon as we see sequences that imply complex editing
 * (escape sequences, non-trivial control chars, paste blobs), we mark the line as unreliable until
 * the next Enter.
 *
 * @param {LineState} state Current line tracking state.
 * @param {string} input Bytes that were sent to the PTY.
 */
function saveLineState(state: LineState, input: string): void {
  for (const ch of input) {
    if (ch === CONTROL_CHARACTERS.escape) {
      state.reliable = false
      continue
    }

    if (ch === CONTROL_CHARACTERS.carriageReturn || ch === CONTROL_CHARACTERS.ctrlJ) {
      state.value = ""
      state.reliable = true
      continue
    }

    if (ch === CONTROL_CHARACTERS.ctrlU) {
      if (state.reliable) {
        state.value = ""
      }
      continue
    }

    if (ch === CONTROL_CHARACTERS.ctrlH || ch === CONTROL_CHARACTERS.delete) {
      if (!state.reliable) {
        continue
      }

      state.value = state.value.length > 0 ? state.value.slice(0, -1) : ""
      continue
    }

    if (!isPrintableAsciiChar(ch)) {
      // For safety, treat any other control characters (including multi-byte / non-ASCII) as unreliable edits.
      state.reliable = false
      continue
    }

    if (state.reliable) {
      state.value += ch
    }
  }
}

/**
 * Determines whether the given input should trigger a shell exit confirmation prompt, based on heuristics about the current terminal state and line input.
 * NOTE: This is intentionally conservative to avoid false positives. We only trigger on Enter when the line input reliably matches "exit" or "logout".
 *
 * @param {Terminal} term Terminal instance to check for normal screen.
 * @param {LineState} state Current line tracking state.
 * @param {string} input The exact bytes that would be sent to the PTY.
 * @returns {boolean} True when the input should trigger an exit confirmation prompt.
 */
function shouldConfirmExitOnEnter(term: Terminal, state: LineState, input: string): boolean {
  if (!isUserEnterKey(input)) return false
  if (!isNormalScreen(term)) return false
  if (!state.reliable) return false

  const cmd = state.value.trim()
  return cmd === "exit" || cmd === "logout"
}

/**
 * Determines whether the given input should trigger a shell exit confirmation prompt, based on heuristics about the current terminal state and line input.
 * NOTE: This is intentionally conservative to avoid false positives. We only trigger on Ctrl+D when the line is reliably empty.
 *
 * @param {Terminal} term Terminal instance to check for normal screen.
 * @param {LineState} state Current line tracking state.
 * @param {string} input The exact bytes that would be sent to the PTY.
 * @returns {boolean} True when the input should trigger an exit confirmation prompt.
 */
function shouldConfirmCtrlD(term: Terminal, state: LineState, input: string): boolean {
  if (input !== CONTROL_CHARACTERS.ctrlD) return false
  if (!isNormalScreen(term)) return false
  if (term.buffer.active.viewportY !== 0) return false
  if (!state.reliable) return false

  // Heuristic: Ctrl+D only exits at an empty prompt. If there is line input, it's often a delete operation.
  return state.value.length === 0
}

/**
 * Creates a confirmation controller that protects accidental shell exits.
 *
 * @param {Terminal} term Terminal instance used to gate prompts to normal screen.
 * @returns {ShellCloseConfirmController} Controller for confirming exit sequences.
 */
export function createShellCloseConfirmController(term: Terminal): ShellCloseConfirmController {
  const line: LineState = { value: "", reliable: true }

  return {
    confirmBeforeSend(input: string): boolean {
      if (shouldConfirmExitOnEnter(term, line, input)) {
        return window.confirm("Close the shell?\n\nThis will end the session.")
      }

      if (shouldConfirmCtrlD(term, line, input)) {
        return window.confirm("Send Ctrl+D?\n\nAt an empty prompt this usually exits the shell.")
      }

      return true
    },

    saveSent(input: string): void {
      saveLineState(line, input)
    },
  }
}
