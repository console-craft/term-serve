import { statSync } from "node:fs"
import { resolve } from "node:path"
import { discoverConfigPath, loadConfigFile } from "@/config-file"
import { DEFAULT_TERMINAL_THEME_ID, TERMINAL_THEME_IDS } from "@/lib/client/terminal-themes"
import { getAuthToken } from "@/lib/server/auth"
import { DEFAULT_SERVER_OPTS, type ServerOpts } from "@/lib/server/http"
import type { PtyCommand } from "@/lib/server/pty"
import { isLocalBindHost } from "@/lib/server/utils/http-utils"
import { type RuntimeOpts, resolveRuntimeOpts } from "@/resolve-opts"
import type { Opts } from "@/types/core"
import { asResult, type Result } from "@/utils/safe-result"
import packageJson from "../../package.json"

/**
 * Resolves the runtime options by loading the config file (if any) and merging it with the CLI options and environment variables.
 *
 * If any error occurs during config file loading or options resolution, it returns the error to be handled by the caller.
 *
 * @param {Opts} opts Parsed CLI options.
 * @returns {Promise<Result<RuntimeOpts>>} The resolved options or an error if the resolution failed.
 */
export async function getRuntimeOpts(opts: Opts): Promise<Result<RuntimeOpts>> {
  // biome-ignore lint/complexity/noUselessUndefinedInitialization: undefined here means "no config file was loaded".
  let configFromFile: Partial<Opts> | undefined = undefined

  const [configPathError, configPath] = await discoverConfigPath(opts.configPath, process.cwd())

  if (configPathError) {
    return [configPathError, null]
  }

  if (configPath) {
    const [loadedConfigError, loadedConfig] = await loadConfigFile(configPath)
    if (loadedConfigError) {
      return [loadedConfigError, null]
    }
    configFromFile = loadedConfig
  }

  const [resolveOptsError, runtimeOpts] = resolveRuntimeOpts({
    defaults: { host: DEFAULT_SERVER_OPTS.host, port: DEFAULT_SERVER_OPTS.port },
    config: configFromFile,
    cli: opts,
    envPort: process.env.PORT,
  })

  if (resolveOptsError) {
    return [resolveOptsError, null]
  }

  return [null, runtimeOpts]
}

/**
 * Constructs a PtyCommand object from the provided command and its arguments.
 *
 * @param {string} commandToRun The command to run in the PTY.
 * @param {string[]} [commandArgs] Optional array of arguments to pass to the command.
 * @return {PtyCommand | undefined} A PtyCommand object if a valid command is provided, or undefined.
 */
function getPtyCommand(commandToRun: string, commandArgs?: string[]): PtyCommand | undefined {
  const command = commandToRun?.trim() ?? ""

  return command
    ? {
        file: command,
        args: commandArgs ?? [],
      }
    : undefined
}

/**
 * Resolves the provided CWD against a base CWD and checks if the result is a valid directory.
 *
 * @param {string} baseCwd The base current working directory to resolve against.
 * @param {string} providedCwd The user-provided CWD, which can be either absolute or relative.
 * @return {Result<string>} An object containing either the resolved CWD or an error message if the path is invalid or not a directory.
 */
function getPtyCwd(baseCwd: string, providedCwd: string): Result<string> {
  // Compute an absolute path constructed from baseCwd + providedCwd (if providedCwd is a relative path;  "../" entries are valid too),
  // or by ignoring baseCwd and directly returning providedCwd if it's already an absolute path.
  const resolvedCwd = resolve(baseCwd, providedCwd)

  const [statusError, status] = asResult(() => statSync(resolvedCwd))
  if (statusError) {
    return [statusError, null]
  }

  if (!status.isDirectory()) {
    return [new Error(`Not a directory: ${resolvedCwd}`), null]
  }

  return [null, resolvedCwd]
}

/**
 * Resolves the configuration for the server based on the app defaults, config file, environment variables and CLI options.
 *
 * It also handles printing usage errors if the configuration is invalid.
 *
 * @param {RuntimeOpts} opts Parsed options.
 * @returns {Promise<Result<ServerOpts>>} The resolved configuration or an error if the configuration is invalid.
 */
export async function getServerOpts(opts: RuntimeOpts): Promise<Result<ServerOpts>> {
  let ptyCwd: string | undefined
  if (opts.cwd) {
    const [ptyCwdError, ptyCwdValue] = getPtyCwd(process.cwd(), opts.cwd)

    if (ptyCwdError) {
      return [new Error(`Invalid --cwd: ${ptyCwdError.message}`), null]
    }

    ptyCwd = ptyCwdValue
  }

  let ptyCommand: PtyCommand | undefined
  if (opts.commandToRun) {
    ptyCommand = getPtyCommand(opts.commandToRun, opts.commandArgs)
  }

  if (!process.stdout.isTTY && (opts.tunnel || !isLocalBindHost(opts.host)) && !opts.authToken) {
    return [
      new Error(
        `You must explicitly provide an auth token when using --tunnel or binding to a non-local host in a non-interactive environment.`,
      ),
      null,
    ]
  }

  const { authToken, isGenerated } = getAuthToken(opts.authToken, opts.host, opts.tunnel)

  return [
    null,
    {
      port: opts.port,
      host: opts.host,
      terminalFont: opts.terminalFont,
      terminalFontSize: opts.terminalFontSize,
      terminalTheme: opts.terminalTheme,
      ptyCwd,
      ptyCommand,
      authToken,
      isGeneratedAuthToken: isGenerated,
    },
  ]
}

/**
 * Get program version from package.json.
 *
 * @return {string} Version string.
 */
function getVersion(): string {
  return packageJson.version
}

/**
 * Get a list of available themes.
 *
 * @return {string[]} Array of theme names.
 */
function getThemes(): string[] {
  return [...TERMINAL_THEME_IDS].sort((a, b) => a.localeCompare(b))
}

/**
 * Display usage information.
 *
 * @param {string} name Script name.
 * @return {string} Usage string.
 */
function showUsage(name: string): string {
  return `
Serve a local terminal in the browser (WebSocket + PTY).

Usage:
  ${name} [options] [command [args...]]

Notes:
  CLI options must come before the optional positional argument "command" and its arguments.
  If a command is provided, everything after it is treated as that command’s arguments and is passed through unchanged.

Options:
  -p, --port <port>                       Port to listen on, default: ${DEFAULT_SERVER_OPTS.port}
      --host <ip|name>                    Bind address, default: ${DEFAULT_SERVER_OPTS.host} (enables auth token by default if not localhost)
      --public                            Alias for --host 0.0.0.0 (enables auth token by default)
      --tunnel                            Open a public Cloudflare tunnel with cloudflared (enables auth token by default)
      --auth-token <secret>               Require a token for WebSocket connections
  -C, --cwd <path>                        Start in the provided directory, default: current working directory
      --config <path>                     Load config from explicit file path. If not provided, the app tries to
                                            load "./term-serve.conf" from the invocation directory (if present).
  -t, --theme <name>                      Terminal theme id, default: ${DEFAULT_TERMINAL_THEME_ID}
      --list-themes                       List available terminal theme ids
      --font <font>                       Local system font to use for the terminal instead of the bundled "TermServe Mono" 
                                            (patched JetBrains Mono Nerd Font). Examples: "Iosevka", "Fira Code", etc.
      --font-size <size[,mobile_size]>    Terminal font size(s) for default viewport, optionally mobile. Examples: 10 or 14,10
      --verbose                           Enable debug logs
  -v, --version                           Show version
  -h, --help                              Show help

Examples:
  PORT=8080 term-serve                    # Custom port set via environment variable
  term-serve --public                     # LAN access (prints an auth token)
  term-serve htop -d 10                   # Serve system monitoring output locally via htop command with a 10 second delay
  term-serve --cwd ~/projects \\
    --host 0.0.0.0 --auth-token secret \\  
    --verbose -p 3000 opencode            # Start in ~/projects, bind to all interfaces, require auth token "secret", 
                                          #   enable verbose logging, and run "opencode" command
  `.trim()
}

/**
 * Checks if any of the provided options needs to print a usage-related message, prints it, and returns if the app should exit afterwards.
 *
 * @param {string} scriptName Script name.
 * @param {RuntimeOpts} opts Parsed options.
 * @returns {boolean} Indicates if a usage-related message was printed and the app should exit.
 */
export function printedUsageMessage(scriptName: string, opts: Opts): boolean {
  if (opts.showHelp) {
    console.log(showUsage(scriptName))
    return true
  }

  if (opts.showVersion) {
    console.log(getVersion())
    return true
  }

  if (opts.listThemes) {
    console.log(getThemes().join("\n"))
    return true
  }

  return false
}

/**
 * Prints a usage-style CLI error and sets exit code 2.
 *
 * @param {string} scriptName Script name.
 * @param {unknown} err Error to display.
 * @returns {void}
 */
export function printUsageError(scriptName: string, err: unknown): void {
  console.error(err instanceof Error ? err.message : String(err))
  console.error(`\n${showUsage(scriptName)}`)
  process.exitCode = 2
}

/**
 * Prints a security warning if the server is bound to a non-local host and prints the auth token if it is set and the environment is interactive.
 *
 * @param {RuntimeOpts} runtimeOpts Resolved runtime options.
 * @param {ServerOpts} serverOpts Resolved server options.
 * @return {void}
 */
export function printAuthToken(runtimeOpts: RuntimeOpts, serverOpts: ServerOpts): void {
  if (!isLocalBindHost(serverOpts.host)) {
    console.log(
      `\u26A0 IMPORTANT SECURITY WARNING:\n\nThe ${runtimeOpts.public ? "--public" : "--host"} flag exposes a shell (or a running app) with user level access to your computer over ${runtimeOpts.public ? "your LAN" : serverOpts.host}!` +
        `\nThe auth token is a safety mechanism to restrict general access, so DON'T SHARE it with anyone that you do not trust.`,
    )
  }

  // Only print the auth token in interactive environments, so it does not accidentally leak in logs or CI environments.
  if (serverOpts.authToken && process.stdout.isTTY) {
    console.log(
      `\n${serverOpts.isGeneratedAuthToken ? "Generated" : "Configured"} auth token (enter this in the client UI): ${serverOpts.authToken}\n`,
    )
  }
}
