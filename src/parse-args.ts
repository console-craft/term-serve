import { ensureValidTerminalThemeId } from "./lib/client/terminal-themes"
import type { Opts } from "./types/core"
import { parseInternalCommand } from "./utils/parse-args-utils"
import type { Result } from "./utils/safe-result"

const defaultOpts: Opts = {}

/**
 * Parse command-line arguments.
 *
 * Options are parsed until the first positional arg (the command).
 * After the command is encountered, all remaining args (including ones starting with '-')
 * are treated as command args and are not interpreted as options.
 *
 * @param {string[]} args Command-line arguments (excluding 'bun' and script name).
 * @return {Result<Partial<Opts>>} Parsed options or an error if arguments are invalid.
 */
export function parseArgs(args: string[]): Result<Partial<Opts>> {
  const opts = { ...defaultOpts }
  const positionalArgs: string[] = []

  const hostPublicConflictMessage = "Conflicting options: --public cannot be used together with --host. Choose one."
  let sawHostFlag = false
  let sawPublicFlag = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (!arg) continue

    // Undocumented, internal option which is not intended for public use.
    // No space version provided to keep usage deterministic.
    if (arg.startsWith("--internal=")) {
      const v = arg.slice("--internal=".length)
      if (!v) return [new Error("Missing value for --internal"), null]

      const positionalArgs = args.slice(i + 1)

      const internalCommand = parseInternalCommand([v, ...positionalArgs])
      if (!internalCommand) {
        return [new Error(`Invalid value for --internal. Received: ${v}`), null]
      }

      opts.internalCommand = internalCommand
      break
    }

    if (arg === "--") {
      positionalArgs.push(...args.slice(i + 1))
      break
    }

    if (arg === "-h" || arg === "--help") {
      opts.showHelp = true
      break
    }

    if (arg === "-v" || arg === "--version") {
      opts.showVersion = true
      break
    }

    if (arg === "--list-themes") {
      opts.listThemes = true
      break
    }

    if (arg === "--verbose") {
      opts.verbose = true
      continue
    }

    if (arg === "-p" || arg === "--port") {
      const v = args[++i]
      if (!v) return [new Error("Missing value for --port"), null]

      const p = Number(v)
      if (!Number.isFinite(p)) {
        return [new Error(`Invalid value for --port. Expected a number, received: ${v}`), null]
      }

      opts.port = p
      continue
    }

    if (arg === "--host") {
      if (sawPublicFlag) {
        return [new Error(hostPublicConflictMessage), null]
      }

      const v = args[++i]
      if (!v) return [new Error("Missing value for --host"), null]

      opts.host = v
      sawHostFlag = true
      continue
    }

    if (arg.startsWith("--host=")) {
      if (sawPublicFlag) {
        return [new Error(hostPublicConflictMessage), null]
      }

      const v = arg.slice("--host=".length)
      if (!v) return [new Error("Missing value for --host"), null]

      opts.host = v
      sawHostFlag = true
      continue
    }

    if (arg === "-C" || arg === "--cwd") {
      const v = args[++i]

      if (!v) return [new Error("Missing value for --cwd"), null]

      opts.cwd = v
      continue
    }

    if (arg.startsWith("--cwd=")) {
      const v = arg.slice("--cwd=".length)
      if (!v) return [new Error("Missing value for --cwd"), null]

      opts.cwd = v
      continue
    }

    if (arg === "--config") {
      const v = args[++i]
      if (!v) return [new Error("Missing value for --config"), null]

      opts.configPath = v
      continue
    }

    if (arg.startsWith("--config=")) {
      const v = arg.slice("--config=".length)
      if (!v) return [new Error("Missing value for --config"), null]

      opts.configPath = v
      continue
    }

    if (arg === "--public") {
      if (sawHostFlag) return [new Error(hostPublicConflictMessage), null]

      opts.host = "0.0.0.0"
      opts.public = true
      sawPublicFlag = true
      continue
    }

    if (arg === "--tunnel") {
      opts.tunnel = true
      continue
    }

    if (arg === "--auth-token") {
      const v = args[++i]
      if (!v) return [new Error("Missing value for --auth-token"), null]

      opts.authToken = v
      continue
    }

    if (arg.startsWith("--auth-token=")) {
      const v = arg.slice("--auth-token=".length)
      if (!v) return [new Error("Missing value for --auth-token"), null]

      opts.authToken = v
      continue
    }

    if (arg === "--font") {
      const v = args[++i]
      if (!v) return [new Error("Missing value for --font"), null]

      opts.terminalFont = v
      continue
    }

    if (arg.startsWith("--font=")) {
      const v = arg.slice("--font=".length)
      if (!v) return [new Error("Missing value for --font"), null]

      opts.terminalFont = v
      continue
    }

    if (arg === "--font-size") {
      const v = args[++i]
      if (!v) return [new Error("Missing value for --font-size"), null]

      opts.terminalFontSize = v
      continue
    }

    if (arg.startsWith("--font-size=")) {
      const v = arg.slice("--font-size=".length)
      if (!v) return [new Error("Missing value for --font-size"), null]

      opts.terminalFontSize = v
      continue
    }

    if (arg === "-t" || arg === "--theme") {
      const v = args[++i]
      if (!v) return [new Error("Missing value for --theme"), null]

      const [themeError, theme] = ensureValidTerminalThemeId(v)
      if (themeError) {
        return [themeError, null]
      }

      opts.terminalTheme = theme
      continue
    }

    if (arg.startsWith("--theme=")) {
      const v = arg.slice("--theme=".length)
      if (!v) return [new Error("Missing value for --theme"), null]

      const [themeError, theme] = ensureValidTerminalThemeId(v)
      if (themeError) {
        return [themeError, null]
      }

      opts.terminalTheme = theme
      continue
    }

    if (arg.startsWith("--port=")) {
      const v = arg.slice("--port=".length)
      if (!v) return [new Error("Missing value for --port"), null]

      const p = Number(v)
      if (!Number.isFinite(p)) {
        return [new Error(`Invalid value for --port. Expected a number, received: ${v}`), null]
      }

      opts.port = p
      continue
    }

    if (arg.startsWith("-")) {
      return [new Error(`Unknown option: ${arg}`), null]
    }

    // First positional arg is the command and everything after is command args.
    positionalArgs.push(...args.slice(i))
    break
  }

  if (opts.showHelp || opts.showVersion || opts.listThemes || opts.internalCommand) {
    return [null, opts]
  }

  if (positionalArgs.length >= 1) {
    opts.commandToRun = positionalArgs[0]
    opts.commandArgs = positionalArgs.slice(1)
  }

  return [null, opts]
}
