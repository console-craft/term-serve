import { basename } from "node:path"
import { startServer } from "./lib/server/http"
import { createLogger } from "./lib/server/logger"
import { parseArgs } from "./parse-args"
import { getRuntimeOpts, getServerOpts, printAuthToken, printQRCode, printedUsageMessage, printUsageError } from "./utils/cli-utils"

/**
 * Runs the program with the given arguments.
 *
 * @param {string[]} argv Command-line arguments (default: `Bun.argv`).
 * @return {Promise<void>} Promise that resolves when the program has finished executing.
 * @throws {Error} If an unexpected error occurs.
 */
export async function main(argv: string[] = Bun.argv): Promise<void> {
  const scriptName = basename(argv[1] ?? "term-serve")
  const scriptArgs = argv.slice(2)

  const [parseOptsError, parsedOpts] = parseArgs(scriptArgs)

  if (parseOptsError) {
    printUsageError(scriptName, parseOptsError)
    return
  }

  if (printedUsageMessage(scriptName, parsedOpts)) return

  const [runtimeOptsError, runtimeOpts] = await getRuntimeOpts(parsedOpts)

  if (runtimeOptsError) {
    printUsageError(scriptName, runtimeOptsError)
    return
  }

  if (parsedOpts.internalCommand) {
    // TODO: handle internal command.
    return
  }

  const [serverOptsError, serverOpts] = await getServerOpts(runtimeOpts)

  if (serverOptsError) {
    printUsageError(scriptName, serverOptsError)
    return
  }

  const log = createLogger({ verbose: Boolean(runtimeOpts.verbose) })

  const [serverStartError, server] = startServer({
    port: serverOpts.port,
    host: serverOpts.host,
    authToken: serverOpts.authToken,
    terminalFont: serverOpts.terminalFont,
    terminalFontSize: serverOpts.terminalFontSize,
    terminalTheme: serverOpts.terminalTheme,
    ptyCwd: serverOpts.ptyCwd,
    ptyCommand: serverOpts.ptyCommand,
    logger: log,
  })

  if (serverStartError) {
    log.error("http_start", {
      reason: serverStartError instanceof Error ? serverStartError.message : String(serverStartError),
    })
    process.exitCode = 1
    return
  }

  console.log(`\nListening on ${server.url.toString()}`)

  printAuthToken(runtimeOpts, serverOpts)
  printQRCode(server.url.toString(), serverOpts.authToken)

  log.info("listen", {
    host: serverOpts.host,
    port: serverOpts.port,
    authRequired: Boolean(serverOpts.authToken),
    url: server.url.toString(),
  })

  return
}

/**
 * Runs the CLI entrypoint and handles unexpected errors.
 *
 * This is what we normally want when running the program, `main` is exported separately mainly for testing purposes.
 *
 * @param {string[]} argv Command-line arguments.
 * @returns {void}
 */
export function run(argv: string[]): void {
  main(argv).catch((err: unknown): void => {
    const stack = err instanceof Error ? err.stack : undefined
    console.error(String(stack ?? err))
    process.exitCode = 1
  })
}

// If this module is being run directly, execute the main function with crash handling.
// The `import.meta.main` guard prevents it to run automatically when it's only imported (eg. in tests), to avoid side effects.
if (import.meta.main) {
  run(Bun.argv)
}
