/** biome-ignore-all lint/style/noNonNullAssertion: allowed for this test */
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { parseArgs } from "@/parse-args"

type CliResult = {
  stdout: string
  stderr: string
  exitCode: number
}

async function runCli(args: string[], opts: { timeoutMs?: number } = {}): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? 5_000
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/bin/term-serve.ts"), ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdoutPromise = new Response(proc.stdout).text()
  const stderrPromise = new Response(proc.stderr).text()

  const timeoutCode = -9_999
  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number>((resolve) => {
      setTimeout(() => resolve(timeoutCode), timeoutMs)
    }),
  ])

  if (exitCode === timeoutCode) {
    proc.kill()
    const [stdout, stderr, realExitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited])
    throw new Error(
      `CLI did not exit within ${timeoutMs}ms (exitCode=${realExitCode}).\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
    )
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

  return { stdout, stderr, exitCode }
}

describe("term-serve CLI public API", () => {
  test("-h prints usage", async () => {
    const res = await runCli(["-h"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
    expect(res.stdout).toContain("Usage:")
  })

  test("--help prints usage", async () => {
    const res = await runCli(["--help"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")

    expect(res.stdout).toContain("Usage:")
    expect(res.stdout).toContain("--config <path>")
  })

  test("--version matches package.json", async () => {
    const pkg = await import("../package.json")
    const res = await runCli(["--version"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
    expect(res.stdout.trim()).toBe(pkg.version)
  })

  test("-v matches package.json", async () => {
    const pkg = await import("../package.json")
    const res = await runCli(["-v"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
    expect(res.stdout.trim()).toBe(pkg.version)
  })

  test("non-interactive + non-local bind requires explicit --auth-token", async () => {
    const res = await runCli(["--host", "0.0.0.0"], { timeoutMs: 3_000 })

    expect(res.exitCode).toBe(2)
    expect(res.stdout).not.toContain("Listening on")
    expect(res.stderr).toContain(
      "You must explicitly provide an auth token when binding to a non-local host in a non-interactive environment.",
    )
  })

  test("unknown option exits 2 and prints usage", async () => {
    const res = await runCli(["--definitely-not-a-real-flag"])

    expect(res.exitCode).toBe(2)

    // parseArgs error should be printed, then usage
    expect(res.stderr).toContain("Unknown option")
    expect(res.stderr).toContain("Usage:")
  })

  test("--public and --host together exits 2 and prints usage", async () => {
    const res = await runCli(["--public", "--host", "127.0.0.1"])

    expect(res.exitCode).toBe(2)
    expect(res.stdout).not.toContain("Listening on")
    expect(res.stderr).toContain("Conflicting options: --public cannot be used together with --host. Choose one.")
    expect(res.stderr).toContain("Usage:")
  })

  test("missing --port value exits 2 and prints usage", async () => {
    const res = await runCli(["--port"])

    expect(res.exitCode).toBe(2)
    expect(res.stderr).toContain("Missing value for --port")
    expect(res.stderr).toContain("Usage:")
  })

  test("invalid --port value exits 2 and prints usage", async () => {
    const res = await runCli(["--port", "not-a-number"])

    expect(res.exitCode).toBe(2)
    expect(res.stderr).toContain("Invalid value for --port")
    expect(res.stderr).toContain("Usage:")
  })

  test("invalid --port=<value> exits 2 and prints usage", async () => {
    const res = await runCli(["--port=NaN"])

    expect(res.exitCode).toBe(2)
    expect(res.stderr).toContain("Invalid value for --port")
    expect(res.stderr).toContain("Usage:")
  })

  test("--help short-circuits parsing and ignores trailing unknown options", async () => {
    const res = await runCli(["--help", "--definitely-not-a-real-flag"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
    expect(res.stdout).toContain("Usage:")
  })

  test("--version short-circuits parsing and ignores trailing unknown options", async () => {
    const pkg = await import("../package.json")
    const res = await runCli(["--version", "--definitely-not-a-real-flag"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
    expect(res.stdout.trim()).toBe(pkg.version)
  })

  test("--list-themes prints available theme ids", async () => {
    const res = await runCli(["--list-themes"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
    expect(res.stdout).toContain("gruvware-dark")
    expect(res.stdout).toContain("gruvbox-dark-medium")
    expect(res.stdout).toContain("tokyo-night")
    expect(res.stdout).toContain("none")
  })
})

describe("term-serve CLI internal API", () => {
  test("--internal short-circuits parsing", async () => {
    const res = await runCli(["--internal=ai:ask", "cpu", "usage", "--help"])

    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe("")
  })
})

describe("parseArgs contract", () => {
  const assureErrorMessage = (err: unknown): string => {
    if (err == null) return ""
    return err instanceof Error ? err.message : String(err)
  }

  test("accepts -p and --port values", () => {
    const [_shortPortOptsError, shortPortOptsValue] = parseArgs(["-p", "8080"])
    expect(shortPortOptsValue!.port).toBe(8080)
    const [_longPortOptsError, longPortOptsValue] = parseArgs(["--port", "9090"])
    expect(longPortOptsValue!.port).toBe(9090)
  })

  test("last --port wins when repeated", () => {
    const [_err, opts] = parseArgs(["--port", "8080", "--port=9090"])
    expect(opts!.port).toBe(9090)
  })

  test("accepts --port=<value>", () => {
    const [_err, opts] = parseArgs(["--port=8080"])
    expect(opts!.port).toBe(8080)
  })

  test("accepts --host and --host=<value>", () => {
    const [_err1, opts1] = parseArgs(["--host", "0.0.0.0"])
    expect(opts1!.host).toBe("0.0.0.0")

    const [_err2, opts2] = parseArgs(["--host=localhost"])
    expect(opts2!.host).toBe("localhost")
  })

  test("accepts -C/--cwd and --cwd=<value>", () => {
    const [_err1, opts1] = parseArgs(["-C", "/tmp"])
    expect(opts1!.cwd).toBe("/tmp")

    const [_err2, opts2] = parseArgs(["--cwd", "/var"])
    expect(opts2!.cwd).toBe("/var")

    const [_err3, opts3] = parseArgs(["--cwd=./relative"])
    expect(opts3!.cwd).toBe("./relative")
  })

  test("accepts --config and --config=<value>", () => {
    const [_err1, opts1] = parseArgs(["--config", "./term-serve.conf"])
    expect(opts1!.configPath).toBe("./term-serve.conf")

    const [_err2, opts2] = parseArgs(["--config=./custom.conf"])
    expect(opts2!.configPath).toBe("./custom.conf")
  })

  test("last --cwd wins when repeated", () => {
    const [_err, opts] = parseArgs(["--cwd", "/tmp", "--cwd=/var"])
    expect(opts!.cwd).toBe("/var")
  })

  test("last --config wins when repeated", () => {
    const [_err, opts] = parseArgs(["--config", "./first.conf", "--config=./second.conf"])
    expect(opts!.configPath).toBe("./second.conf")
  })

  test("accepts --public as an alias for --host 0.0.0.0", () => {
    const [_err1, opts1] = parseArgs(["--public"])
    expect(opts1!.host).toBe("0.0.0.0")
    const [_err2, opts2] = parseArgs(["--public"])
    expect(opts2!.public).toBe(true)
  })

  test("errors when --public is used together with --host", () => {
    const [err1] = parseArgs(["--host", "127.0.0.1", "--public"])
    expect(assureErrorMessage(err1)).toBe(
      "Conflicting options: --public cannot be used together with --host. Choose one.",
    )

    const [err2] = parseArgs(["--public", "--host", "127.0.0.1"])
    expect(assureErrorMessage(err2)).toBe(
      "Conflicting options: --public cannot be used together with --host. Choose one.",
    )

    const [err3] = parseArgs(["--host=127.0.0.1", "--public"])
    expect(assureErrorMessage(err3)).toBe(
      "Conflicting options: --public cannot be used together with --host. Choose one.",
    )
  })

  test("accepts --auth-token and --auth-token=<value>", () => {
    const [_err1, opts1] = parseArgs(["--auth-token", "secret"])
    expect(opts1!.authToken).toBe("secret")

    const [_err2, opts2] = parseArgs(["--auth-token=secret2"])
    expect(opts2!.authToken).toBe("secret2")
  })

  test("accepts --font and --font=<value>", () => {
    const [_err1, opts1] = parseArgs(["--font", "Fira Code"])
    expect(opts1!.terminalFont).toBe("Fira Code")

    const [_err2, opts2] = parseArgs(["--font=JetBrains Mono"])
    expect(opts2!.terminalFont).toBe("JetBrains Mono")
  })

  test("accepts --font-size and --font-size=<value>", () => {
    const [_err1, opts1] = parseArgs(["--font-size", "11"])
    expect(opts1!.terminalFontSize).toBe("11")

    const [_err2, opts2] = parseArgs(["--font-size=11,9"])
    expect(opts2!.terminalFontSize).toBe("11,9")
  })

  test("accepts --verbose", () => {
    const [_err, opts] = parseArgs(["--verbose"])
    expect(opts!.verbose).toBe(true)
  })

  test("accepts -t/--theme and --theme=<value>", () => {
    const [_err1, opts1] = parseArgs(["-t", "tokyo-night"])
    expect(opts1!.terminalTheme).toBe("tokyo-night")

    const [_err2, opts2] = parseArgs(["--theme", "gruvbox-light-medium"])
    expect(opts2!.terminalTheme).toBe("gruvbox-light-medium")

    const [_err3, opts3] = parseArgs(["--theme=gruvbox-dark-medium"])
    expect(opts3!.terminalTheme).toBe("gruvbox-dark-medium")

    const [_err4, opts4] = parseArgs(["--theme=none"])
    expect(opts4!.terminalTheme).toBe("none")
  })

  test("errors for unknown theme id", () => {
    const [err] = parseArgs(["--theme", "definitely-not-a-theme"])
    expect(assureErrorMessage(err)).toContain("Unknown theme")
  })

  test("errors when -p/--port is missing a value", () => {
    const [err1] = parseArgs(["-p"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --port")

    const [err2] = parseArgs(["--port"])
    expect(assureErrorMessage(err2)).toBe("Missing value for --port")

    const [err3] = parseArgs(["--port="])
    expect(assureErrorMessage(err3)).toBe("Missing value for --port")
  })

  test("errors when --host is missing a value", () => {
    const [err1] = parseArgs(["--host"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --host")

    const [err2] = parseArgs(["--host="])
    expect(assureErrorMessage(err2)).toBe("Missing value for --host")
  })

  test("errors when --auth-token is missing a value", () => {
    const [err1] = parseArgs(["--auth-token"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --auth-token")

    const [err2] = parseArgs(["--auth-token="])
    expect(assureErrorMessage(err2)).toBe("Missing value for --auth-token")
  })

  test("errors when -C/--cwd is missing a value", () => {
    const [err1] = parseArgs(["-C"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --cwd")

    const [err2] = parseArgs(["--cwd"])
    expect(assureErrorMessage(err2)).toBe("Missing value for --cwd")

    const [err3] = parseArgs(["--cwd="])
    expect(assureErrorMessage(err3)).toBe("Missing value for --cwd")
  })

  test("errors when --config is missing a value", () => {
    const [err1] = parseArgs(["--config"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --config")

    const [err2] = parseArgs(["--config="])
    expect(assureErrorMessage(err2)).toBe("Missing value for --config")
  })

  test("errors when --font is missing a value", () => {
    const [err1] = parseArgs(["--font"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --font")

    const [err2] = parseArgs(["--font="])
    expect(assureErrorMessage(err2)).toBe("Missing value for --font")
  })

  test("errors when --font-size is missing a value", () => {
    const [err1] = parseArgs(["--font-size"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --font-size")

    const [err2] = parseArgs(["--font-size="])
    expect(assureErrorMessage(err2)).toBe("Missing value for --font-size")
  })

  test("errors when -t/--theme is missing a value", () => {
    const [err1] = parseArgs(["-t"])
    expect(assureErrorMessage(err1)).toBe("Missing value for --theme")

    const [err2] = parseArgs(["--theme"])
    expect(assureErrorMessage(err2)).toBe("Missing value for --theme")

    const [err3] = parseArgs(["--theme="])
    expect(assureErrorMessage(err3)).toBe("Missing value for --theme")
  })

  test("errors when --port value is not numeric", () => {
    const [err1] = parseArgs(["--port", "abc"])
    expect(assureErrorMessage(err1)).toBe("Invalid value for --port. Expected a number, received: abc")

    const [err2] = parseArgs(["--port=abc"])
    expect(assureErrorMessage(err2)).toBe("Invalid value for --port. Expected a number, received: abc")
  })

  test("assigns commandToRun/commandArgs from positional args", () => {
    const [_err1, opts1] = parseArgs(["btop"])
    expect(opts1!.commandToRun).toBe("btop")
    expect(opts1!.commandArgs).toEqual([])

    const [_err2, opts2] = parseArgs(["htop", "-d", "10"])
    expect(opts2!.commandToRun).toBe("htop")
    expect(opts2!.commandArgs).toEqual(["-d", "10"])

    const [_err3, opts3] = parseArgs(["--", "btop", "--help"])
    expect(opts3!.commandToRun).toBe("btop")
    expect(opts3!.commandArgs).toEqual(["--help"])
  })

  test("stops option parsing at the command and passes through flags", () => {
    const [_err, opts] = parseArgs(["btop", "--host", "0.0.0.0", "--port", "9999"])
    expect(opts!.host).toBeUndefined()
    expect(opts!.port).toBeUndefined()
    expect(opts!.commandToRun).toBe("btop")
    expect(opts!.commandArgs).toEqual(["--host", "0.0.0.0", "--port", "9999"])
  })

  test("--help after command is treated as a command arg", () => {
    const [_err, opts] = parseArgs(["btop", "--help"])
    expect(opts!.showHelp).toBeUndefined()
    expect(opts!.commandToRun).toBe("btop")
    expect(opts!.commandArgs).toEqual(["--help"])
  })

  test("--config after command is treated as a command arg", () => {
    const [_err, opts] = parseArgs(["btop", "--config", "./term-serve.conf"])
    expect(opts!.configPath).toBeUndefined()
    expect(opts!.commandToRun).toBe("btop")
    expect(opts!.commandArgs).toEqual(["--config", "./term-serve.conf"])
  })

  test("errors for unknown option", () => {
    const [err] = parseArgs(["--unknown"])
    expect(assureErrorMessage(err)).toContain("Unknown option")
  })

  test("help/version short-circuit and skip later unknown flags", () => {
    const [_err1, opts1] = parseArgs(["--help", "--unknown"])
    expect(opts1!.showHelp).toBe(true)

    const [_err2, opts2] = parseArgs(["-h", "--unknown"])
    expect(opts2!.showHelp).toBe(true)

    const [_err3, opts3] = parseArgs(["--version", "--unknown"])
    expect(opts3!.showVersion).toBe(true)

    const [_err4, opts4] = parseArgs(["-v", "--unknown"])
    expect(opts4!.showVersion).toBe(true)
  })

  test("--list-themes short-circuits parsing and ignores trailing unknown options", () => {
    const [_err, opts] = parseArgs(["--list-themes", "--unknown"])
    expect(opts!.listThemes).toBe(true)
  })

  // TODO: add tests for `--internal`
})
