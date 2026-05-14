import { asResult, type Result } from "@/utils/safe-result"

/**
 * Waits for a process to exit, enforcing a timeout.
 *
 * @param {Bun.Subprocess} proc Process to wait for.
 * @param {number} timeoutMs Timeout in milliseconds.
 * @returns {Promise<number | null>} Exit code, or null on timeout.
 */
async function waitForExit(proc: Bun.Subprocess, timeoutMs: number): Promise<number | null> {
  let timeout: Timer | undefined

  try {
    return await Promise.race([
      proc.exited,
      new Promise<number | null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

/**
 * Verifies that cloudflared can be executed.
 *
 * @param {string} command cloudflared executable name or path.
 * @returns {Promise<Result<void>>} Success when cloudflared is available.
 */
export async function assertCloudflaredAvailable(command: string): Promise<Result<void>> {
  const [spawnError, proc] = asResult(() => {
    return Bun.spawn([command, "--version"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
  })

  if (spawnError) {
    return [
      new Error("cloudflared is required for --tunnel but was not found. Install cloudflared and try again."),
      null,
    ]
  }

  const exitCode = await waitForExit(proc, 5_000)
  if (exitCode !== 0) {
    if (exitCode === null) {
      proc.kill()
    }
    return [new Error("cloudflared is required for --tunnel but did not run successfully."), null]
  }

  return [null, undefined]
}

/**
 * Reads a process stream and forwards decoded chunks to a callback.
 *
 * @param {ReadableStream<Uint8Array> | null} stream Process output stream.
 * @param {(text: string) => void} onText Chunk callback.
 * @returns {void}
 */
export function consumeStream(stream: ReadableStream<Uint8Array> | null, onText: (text: string) => void): void {
  if (!stream) {
    return
  }

  const decoder = new TextDecoder()

  void (async (): Promise<void> => {
    const reader = stream.getReader()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      onText(decoder.decode(value, { stream: true }))
    }
  })()
}

/**
 * Creates a promise that resolves with the first tunnel URL found in process output.
 *
 * @param {Bun.Subprocess} proc cloudflared process.
 * @param {number} timeoutMs Startup timeout in milliseconds.
 * @param {(text: string) => string | undefined} parseUrl URL parser for buffered output.
 * @returns {{ onText: (text: string) => void; promise: Promise<string> }} Output observer and URL promise.
 */
export function waitForTunnelUrl(
  proc: Bun.Subprocess,
  timeoutMs: number,
  parseUrl: (text: string) => string | undefined,
): { onText: (text: string) => void; promise: Promise<string> } {
  let buffer = ""
  let timeout: Timer | undefined
  let settled = false
  let resolveUrl: (url: string) => void
  let rejectUrl: (err: Error) => void

  const promise = new Promise<string>((resolve, reject) => {
    resolveUrl = resolve
    rejectUrl = reject
  })

  timeout = setTimeout(() => {
    if (settled) {
      return
    }
    settled = true
    rejectUrl(new Error("Timed out waiting for cloudflared tunnel URL."))
  }, timeoutMs)

  void proc.exited.then((exitCode) => {
    if (settled) {
      return
    }
    settled = true
    rejectUrl(new Error(`cloudflared exited before publishing a tunnel URL (exit code ${exitCode}).`))
  })

  return {
    promise: promise.finally(() => {
      if (timeout) {
        clearTimeout(timeout)
      }
    }),
    onText(text: string): void {
      if (settled) {
        return
      }

      buffer += text
      const url = parseUrl(buffer)
      if (!url) {
        return
      }

      settled = true
      resolveUrl(url)
    },
  }
}
