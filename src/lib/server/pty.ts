import { type IDisposable, type IPty, spawn } from "bun-pty"
import { asResult, type Result } from "@/utils/safe-result"

/**
 * Command to run inside the PTY instead of launching an interactive shell.
 */
export type PtyCommand = {
  /** Executable name or path. */
  file: string
  /** Arguments passed to the executable. */
  args: string[]
}

/**
 * Determines the appropriate shell to use based on the operating system and environment variables.
 * On Windows, it defaults to `cmd.exe` or the value of `COMSPEC`.
 * On Unix-like systems, it defaults to `/bin/bash` or the value of `SHELL`.
 *
 * @returns {string} The path to the shell executable.
 */
function getShell(): string {
  if (process.platform === "win32") return process.env.COMSPEC ?? "cmd.exe"
  return process.env.SHELL ?? "/bin/bash"
}

/**
 * Constructs the environment variables for the shell process, ensuring that all values are strings.
 * It also sets specific variables to ensure proper terminal behavior and to silence WezTerm warnings.
 *
 * @returns {Record<string, string>} An object containing the environment variables for the shell process.
 */
function getShellEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue
    env[key] = value
  }

  env.TERM = "xterm-256color"
  env.COLORTERM = "truecolor"
  // Silence WezTerm related console warnings.
  env.WEZTERM_SHELL_SKIP_USER_VARS = "1"
  env.WEZTERM_SHELL_SKIP_SEMANTIC_ZONES = "1"

  return env
}

/**
 * Creates a new pseudo-terminal (PTY) instance.
 *
 * If `command` is provided, it is spawned directly (no intermediate shell).
 * Otherwise, the user's shell is started.
 *
 * @param {number} cols The number of columns for the PTY.
 * @param {number} rows The number of rows for the PTY.
 * @param {string | undefined} cwd The working directory to start the process in (default: `process.cwd()`).
 * @param {PtyCommand | undefined} command Optional command to run instead of a shell.
 * @returns {Result<IPty>} Error/value tuple containing the created PTY.
 */
export function createPty(cols: number, rows: number, cwd?: string, command?: PtyCommand): Result<IPty> {
  const env = getShellEnv()
  const cmdFile = command?.file?.trim() ?? ""
  const cmdArgs = command?.args ?? []

  if (cmdFile) {
    return asResult(() =>
      spawn(cmdFile, cmdArgs, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: cwd ?? process.cwd(),
        env,
      }),
    )
  }

  const shell = getShell()

  return asResult(() =>
    spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: cwd ?? process.cwd(),
      env,
    }),
  )
}

/**
 * Registers a callback function to be invoked whenever the PTY emits data.
 * The callback receives the data emitted by the PTY as a string argument.
 *
 * @param {IPty} pty The PTY instance to listen to for data events.
 * @param {(data: string) => void} callback The function to call when data is emitted by the PTY.
 * @return {IDisposable} An object that can be disposed to remove the event listener for the PTY data event.
 */
export function onPtyData(pty: IPty, callback: (data: string) => void): IDisposable {
  return pty.onData(callback)
}

/**
 * Registers a callback function to be invoked when the PTY process exits.
 * The callback receives an object containing the exit code of the process.
 *
 * @param {IPty} pty The PTY instance to listen to for exit events.
 * @param {(data: { exitCode: number }) => void} callback The function to call when the PTY process exits.
 * @return {IDisposable} An object that can be disposed to remove the event listener for the PTY exit event.
 */
export function onPtyExit(pty: IPty, callback: (data: { exitCode: number }) => void): IDisposable {
  return pty.onExit(callback)
}

/**
 * Resizes the PTY to the specified number of columns and rows.
 * This function should be called whenever the terminal size changes to ensure that the PTY is aware of the
 * new dimensions and can adjust its behavior accordingly.
 *
 * @param {IPty} pty The PTY instance to resize.
 * @param {number} cols The new number of columns for the PTY.
 * @param {number} rows The new number of rows for the PTY.
 */
export function resizePty(pty: IPty, cols: number, rows: number): void {
  pty.resize(cols, rows)
}

/**
 * Sends the specified string data to the PTY, which will be processed as input to the shell or command running within the PTY.
 * This function is typically called when the user types input into the terminal interface.
 *
 * @param {IPty} pty The PTY instance to send data to.
 * @param {string} data The string data to send to the PTY.
 */
export function sendToPty(pty: IPty, data: string): void {
  pty.write(data)
}

/**
 * Kills the process associated with the given PTY instance if it exists.
 * This function should be called when the terminal session is closed or when the process needs to be terminated.
 *
 * @param {IPty | undefined} pty The PTY instance whose process should be killed.
 * @returns {Result<void>} Error/value tuple indicating whether cleanup succeeded.
 */
export function killRunningProcess(pty: IPty | undefined): Result<void> {
  if (!pty) {
    return [null, undefined]
  }

  return asResult(() => pty.kill())
}

/**
 * Disposes a resource if it exists.
 *
 * @param {IDisposable | undefined} resource The disposable resource to clean up.
 * @returns {Result<void>} Error/value tuple indicating whether cleanup succeeded.
 */
export function cleanup(resource: IDisposable | undefined): Result<void> {
  if (!resource) {
    return [null, undefined]
  }

  return asResult(() => resource.dispose())
}

/**
 * Formats a PTY command as a single human-readable command line.
 *
 * This is intended for UI hints only (e.g. "Running command ..." in the browser terminal), not for re-executing the command.
 *
 * @param {PtyCommand} command The PTY command config.
 * @return {string} A display-friendly command line.
 */
export function getFormattedPtyCommand(command: PtyCommand): string {
  const parts = [command.file, ...command.args].map((p) => p.trim()).filter(Boolean)
  return parts.join(" ")
}
