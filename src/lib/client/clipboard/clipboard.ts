/// <reference lib="dom" />

import type { Terminal } from "ghostty-web"
import { asAsyncResult, asError, asResult } from "@/utils/safe-result"

type CopyAlertMode = "with-text" | "generic"

function showCopySuccess(text: string, mode: CopyAlertMode): void {
  if (mode === "with-text") {
    alert(`Copied to clipboard:\n\n"${text.slice(0, 200)}"${text.length > 200 ? " …" : ""}`)
    return
  }

  alert("Copied to clipboard")
}

function copyTextWithExecCommand(text: string): boolean {
  const fallbackInput = document.createElement("textarea")
  fallbackInput.value = text
  fallbackInput.setAttribute("readonly", "readonly")
  fallbackInput.style.position = "fixed"
  fallbackInput.style.top = "0"
  fallbackInput.style.left = "0"
  fallbackInput.style.opacity = "0"
  fallbackInput.style.pointerEvents = "none"

  document.body.append(fallbackInput)
  fallbackInput.focus()
  fallbackInput.select()
  fallbackInput.setSelectionRange(0, text.length)

  try {
    const [error, copied] = asResult(() => document.execCommand("copy"))
    if (error) {
      return false
    }

    return copied
  } finally {
    fallbackInput.remove()
  }
}

/**
 * Writes text to the system clipboard and reports result to the user.
 */
export async function copyTextToClipboard(text: string, mode: CopyAlertMode = "generic"): Promise<boolean> {
  if (!text) return false

  const [clipboardError, clipboard] = asResult(() => navigator.clipboard)
  if (!clipboardError && clipboard?.writeText) {
    const [writeError] = await asAsyncResult(() => clipboard.writeText(text))
    if (!writeError) {
      showCopySuccess(text, mode)
      return true
    }
  }

  if (copyTextWithExecCommand(text)) {
    showCopySuccess(text, mode)
    return true
  }

  alert("Copy failed")
  return false
}

/**
 * Copies the current terminal selection to the system clipboard.
 */
export async function copyCurrentSelection(term: Terminal, mode: CopyAlertMode = "with-text"): Promise<boolean> {
  const text = term.getSelection()

  try {
    return await copyTextToClipboard(text, mode)
  } finally {
    term.clearSelection()
  }
}

/**
 * Reads clipboard text and pastes it into the terminal.
 */
export async function pasteFromClipboard(term: Terminal): Promise<void> {
  function promptForManualPaste(reason: string): string | null {
    const text = window.prompt(
      `Direct clipboard read is unavailable: ${reason}.\n\nPaste text manually below, then press OK:`,
      "",
    )

    if (!text) return null
    return text
  }

  const [clipboardError, clipboard] = asResult(() => navigator.clipboard)
  if (clipboardError || !clipboard?.readText) {
    const text = promptForManualPaste("Clipboard API readText() is not supported")
    if (!text) return
    term.paste(text)
    return
  }

  const [readError, text] = await asAsyncResult(() => clipboard.readText())
  if (readError) {
    const message = asError(readError).message
    const promptedText = promptForManualPaste(message)
    if (!promptedText) return
    term.paste(promptedText)
    return
  }

  if (!text) {
    return
  }

  term.paste(text)
}
