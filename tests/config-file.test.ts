import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { discoverConfigPath, loadConfigFile } from "@/config-file"
import { parseConfigObject } from "@/lib/server/config-file-parser"
import * as httpModule from "@/lib/server/http"
import { DEFAULT_SERVER_OPTS } from "@/lib/server/http"
import * as loggerModule from "@/lib/server/logger"
import * as tunnelModule from "@/utils/cloudflared-tunnel"

type MockPtyCommand = {
  file: string
  args: string[]
}

type StartServerCall = {
  port?: number
  host?: string
  authToken?: string
  terminalFont?: string
  terminalFontSize?: string
  terminalTheme?: string
  ptyCwd?: string
  ptyCommand?: MockPtyCommand
}

type RunMainResult = {
  stdout: string
  stderr: string
  exitCode: number | undefined
}

type WithImplementationSpy = {
  withImplementation<T>(impl: (...args: unknown[]) => unknown, run: () => T): T
}

const tempDirs: string[] = []
const startServerCalls: StartServerCall[] = []
const startTunnelCalls: string[] = []

const { main } = await import("@/cli")

/**
 * Parses TOML text and validates it through the config parser.
 *
 * @param {string} toml TOML document text.
 * @returns {ReturnType<typeof parseConfigObject>} Parsed config result tuple.
 */
function parseTomlConfig(toml: string): ReturnType<typeof parseConfigObject> {
  const parsed = Bun.TOML.parse(toml)
  return parseConfigObject(parsed, "test.conf")
}

/**
 * Creates a temporary directory and tracks it for cleanup.
 *
 * @returns {Promise<string>} Temporary directory path.
 */
async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "term-serve-cli-config-"))
  tempDirs.push(dir)
  return dir
}

/**
 * Writes a config file in a target directory.
 *
 * @param {string} dir Target directory.
 * @param {string} fileName Config file name.
 * @param {string} text TOML content.
 * @returns {Promise<string>} Absolute file path.
 */
async function writeConfig(dir: string, fileName: string, text: string): Promise<string> {
  const path = join(dir, fileName)
  await writeFile(path, text, "utf8")
  return path
}

/**
 * Writes a local term-serve.conf fixture.
 *
 * @param {string} dir Target directory.
 * @param {string} text Config contents.
 * @returns {Promise<void>}
 */
async function writeLocalConfig(dir: string, text: string): Promise<void> {
  await writeFile(join(dir, "term-serve.conf"), text, "utf8")
}

/**
 * Runs main() with captured stdio and controlled cwd/env.
 *
 * @param {string[]} args CLI args after script name.
 * @param {string} cwd Working directory for this invocation.
 * @param {string | undefined} envPort Optional PORT environment value.
 * @returns {Promise<RunMainResult>} Captured process result.
 */
async function runMain(args: string[], cwd: string, envPort?: string): Promise<RunMainResult> {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  const originalCwd = process.cwd()
  const originalExitCode = process.exitCode
  const originalEnvPort = process.env.PORT
  const originalLog = console.log
  const originalError = console.error

  console.log = (...values: unknown[]): void => {
    stdoutLines.push(values.map(String).join(" "))
  }

  console.error = (...values: unknown[]): void => {
    stderrLines.push(values.map(String).join(" "))
  }

  process.exitCode = undefined
  if (envPort === undefined) {
    delete process.env.PORT
  } else {
    process.env.PORT = envPort
  }

  process.chdir(cwd)

  const startServerSpy = spyOn(httpModule, "startServer")
  const createLoggerSpy = spyOn(loggerModule, "createLogger")
  const startCloudflaredTunnelSpy = spyOn(tunnelModule, "startCloudflaredTunnel")
  const startServerSpyWithImpl = startServerSpy as unknown as WithImplementationSpy
  const createLoggerSpyWithImpl = createLoggerSpy as unknown as WithImplementationSpy
  const startCloudflaredTunnelSpyWithImpl = startCloudflaredTunnelSpy as unknown as WithImplementationSpy

  try {
    return await startServerSpyWithImpl.withImplementation(
      (opts: unknown) => {
        const serverOpts = opts as httpModule.ServerOpts
        startServerCalls.push({
          port: serverOpts.port,
          host: serverOpts.host,
          authToken: serverOpts.authToken,
          terminalFont: serverOpts.terminalFont,
          terminalFontSize: serverOpts.terminalFontSize,
          terminalTheme: serverOpts.terminalTheme,
          ptyCwd: serverOpts.ptyCwd,
          ptyCommand: serverOpts.ptyCommand,
        })

        return [
          null,
          {
            url: new URL(
              `http://${serverOpts.host ?? DEFAULT_SERVER_OPTS.host}:${serverOpts.port ?? DEFAULT_SERVER_OPTS.port}`,
            ),
            stop() {},
          },
        ] as const
      },
      async () => {
        return await createLoggerSpyWithImpl.withImplementation(
          () => {
            return {
              level: "info",
              isVerbose: false,
              debug() {},
              info() {},
              warn() {},
              error() {},
            }
          },
          async () => {
            return await startCloudflaredTunnelSpyWithImpl.withImplementation(
              (targetUrl: unknown) => {
                startTunnelCalls.push(String(targetUrl))

                return [
                  null,
                  {
                    url: "https://test-tunnel.trycloudflare.com",
                    exited: new Promise<number | null>(() => {}),
                    stop() {},
                  },
                ] as const
              },
              async () => {
                await main(["bun", "term-serve", ...args])
                return {
                  stdout: stdoutLines.join("\n"),
                  stderr: stderrLines.join("\n"),
                  exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
                }
              },
            )
          },
        )
      },
    )
  } finally {
    process.chdir(originalCwd)
    process.exitCode = originalExitCode
    if (originalEnvPort === undefined) {
      delete process.env.PORT
    } else {
      process.env.PORT = originalEnvPort
    }
    console.log = originalLog
    console.error = originalError

    startServerSpy.mockRestore()
    createLoggerSpy.mockRestore()
    startCloudflaredTunnelSpy.mockRestore()
  }
}

beforeEach(() => {
  startServerCalls.length = 0
  startTunnelCalls.length = 0
})

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) {
      continue
    }
    await rm(dir, { recursive: true, force: true })
  }
})

describe("config file CLI integration", () => {
  test("loads local config and maps values into resolved runtime opts", async () => {
    const cwd = await createTempDir()
    await writeLocalConfig(
      cwd,
      `
[server]
port = 4242
host = "127.0.0.1"

[auth]
auth_token = "cfg-secret"

[shell]
cwd = "."

[terminal]
theme = "tokyo-night"
font = "Iosevka"
font_size = [12, 9]

[command]
argv = ["echo", "hello"]
`,
    )

    const result = await runMain([], cwd)
    const call = startServerCalls[0]

    expect(result.exitCode).toBeUndefined()
    expect(startServerCalls).toHaveLength(1)
    expect(call).toMatchObject({
      port: 4242,
      host: "127.0.0.1",
      authToken: "cfg-secret",
      terminalFont: "Iosevka",
      terminalFontSize: "12,9",
      terminalTheme: "tokyo-night",
      ptyCwd: cwd,
      ptyCommand: { file: "echo", args: ["hello"] },
    })
  })

  test("env PORT overrides config port", async () => {
    const cwd = await createTempDir()
    await writeLocalConfig(cwd, "port = 1111")

    const result = await runMain([], cwd, "2222")
    const call = startServerCalls[0]

    expect(result.exitCode).toBeUndefined()
    expect(startServerCalls).toHaveLength(1)
    expect(call?.port).toBe(2222)
  })

  test("CLI --port overrides env PORT", async () => {
    const cwd = await createTempDir()
    await writeLocalConfig(cwd, "port = 1111")

    const result = await runMain(["--port", "3333"], cwd, "2222")
    const call = startServerCalls[0]

    expect(result.exitCode).toBeUndefined()
    expect(startServerCalls).toHaveLength(1)
    expect(call?.port).toBe(3333)
  })

  test("CLI positional command overrides config command argv", async () => {
    const cwd = await createTempDir()
    await writeLocalConfig(
      cwd,
      `
[command]
argv = ["htop", "-d", "10"]
`,
    )

    const result = await runMain(["btop", "--utf-force"], cwd)
    const call = startServerCalls[0]

    expect(result.exitCode).toBeUndefined()
    expect(startServerCalls).toHaveLength(1)
    expect(call?.ptyCommand).toEqual({ file: "btop", args: ["--utf-force"] })
  })

  test("CLI --tunnel starts cloudflared and prints the tunnel URL", async () => {
    const cwd = await createTempDir()

    const result = await runMain(["--tunnel", "--auth-token", "secret"], cwd)

    expect(result.exitCode).toBeUndefined()
    expect(startServerCalls).toHaveLength(1)
    expect(startTunnelCalls).toEqual(["http://127.0.0.1:31337/"])
    expect(result.stdout).toContain("Resolved URL: https://test-tunnel.trycloudflare.com")
  })

  test("help skips config discovery/loading", async () => {
    const cwd = await createTempDir()
    await writeLocalConfig(cwd, "foo = 1")

    const result = await runMain(["--help"], cwd)

    expect(result.exitCode).toBeUndefined()
    expect(startServerCalls).toHaveLength(0)
    expect(result.stdout).toContain("Usage:")
    expect(result.stderr).toBe("")
  })

  test("config errors exit 2 and print usage", async () => {
    const cwd = await createTempDir()
    await writeLocalConfig(cwd, "foo = 1")

    const result = await runMain([], cwd)

    expect(result.exitCode).toBe(2)
    expect(startServerCalls).toHaveLength(0)
    expect(result.stderr).toContain("Unknown top-level key: foo")
    expect(result.stderr).toContain("Usage:")
  })
})

describe("config file discovery and loading", () => {
  test("explicit path wins over local term-serve.conf", async () => {
    const cwd = await createTempDir()
    await writeConfig(cwd, "term-serve.conf", "port = 1111")
    const explicitPath = await writeConfig(cwd, "custom.conf", "port = 2222")

    const [_discoverErr, discovered] = await discoverConfigPath("./custom.conf", cwd)

    expect(discovered).toBe(resolve(cwd, "custom.conf"))
    const [_loadErr, loaded] = await loadConfigFile(discovered as string)
    expect(loaded?.port).toBe(2222)
    expect(discovered).toBe(explicitPath)
  })

  test("local term-serve.conf is discovered only when present", async () => {
    const cwd = await createTempDir()

    const [_missingErr, missing] = await discoverConfigPath(undefined, cwd)
    expect(missing).toBeUndefined()

    const localPath = await writeConfig(cwd, "term-serve.conf", 'host = "127.0.0.1"')
    const [_discoveredErr, discovered] = await discoverConfigPath(undefined, cwd)

    expect(discovered).toBe(localPath)
    const [_loaddedErr, loaded] = await loadConfigFile(discovered as string)
    expect(loaded?.host).toBe("127.0.0.1")
  })

  test("missing explicit config path is a fatal error", async () => {
    const cwd = await createTempDir()
    const [error] = await discoverConfigPath("./missing.conf", cwd)
    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain("Config file not found")
  })
})

describe("config file parsing", () => {
  test("accepts a full sectioned config", () => {
    const [error, opts] = parseTomlConfig(`
[server]
port = 4242
public = true
tunnel = true

[auth]
auth_token = "secret-token"

[shell]
cwd = "/tmp"

[terminal]
theme = "tokyo-night"
font = "Iosevka"
font_size = [11, 8]

[logging]
verbose = true

[command]
argv = ["htop", "-d", "10"]
`)

    expect(error).toBeNull()
    expect(opts).toEqual({
      port: 4242,
      public: true,
      host: "0.0.0.0",
      tunnel: true,
      authToken: "secret-token",
      cwd: "/tmp",
      terminalTheme: "tokyo-night",
      terminalFont: "Iosevka",
      terminalFontSize: "11,8",
      verbose: true,
      commandToRun: "htop",
      commandArgs: ["-d", "10"],
    })
  })

  test("accepts minimal top-level flat keys", () => {
    const [error, opts] = parseTomlConfig(`
host = "127.0.0.1"
port = 31337
auth_token = "abc123"
tunnel = true
`)

    expect(error).toBeNull()
    expect(opts).toEqual({
      host: "127.0.0.1",
      port: 31337,
      authToken: "abc123",
      tunnel: true,
    })
  })

  test("accepts terminal.font_size as a single number", () => {
    const [error, opts] = parseTomlConfig(`
[terminal]
font_size = 12
`)

    expect(error).toBeNull()
    expect(opts?.terminalFontSize).toBe("12")
  })

  test("rejects unknown top-level scalar keys", () => {
    const [error, opts] = parseTomlConfig("foo = 1")
    expect(opts).toBeNull()
    expect(error?.message).toContain("Unknown top-level key: foo")
  })

  test("rejects unknown top-level sections", () => {
    const [error, opts] = parseTomlConfig("[foo]\nbar = 1")
    expect(opts).toBeNull()
    expect(error?.message).toContain("Unknown top-level section: [foo]")
  })

  test("rejects unknown keys inside known sections", () => {
    const [error, opts] = parseTomlConfig("[server]\nfoo = 1")
    expect(opts).toBeNull()
    expect(error?.message).toContain("Unknown key in [server]: foo")
  })

  test("rejects flat and section duplicates", () => {
    const [portError, portOpts] = parseTomlConfig("port = 1\n[server]\nport = 2")
    expect(portOpts).toBeNull()
    expect(portError?.message).toContain('Duplicate key representation for "port"')

    const [hostError, hostOpts] = parseTomlConfig('host = "127.0.0.1"\n[server]\nhost = "0.0.0.0"')
    expect(hostOpts).toBeNull()
    expect(hostError?.message).toContain('Duplicate key representation for "host"')

    const [authTokenError, authTokenOpts] = parseTomlConfig('auth_token = "a"\n[auth]\nauth_token = "b"')
    expect(authTokenOpts).toBeNull()
    expect(authTokenError?.message).toContain('Duplicate key representation for "auth_token"')

    const [tunnelError, tunnelOpts] = parseTomlConfig("tunnel = true\n[server]\ntunnel = false")
    expect(tunnelOpts).toBeNull()
    expect(tunnelError?.message).toContain('Duplicate key representation for "tunnel"')
  })

  test("rejects host and public together", () => {
    const [error, opts] = parseTomlConfig('host = "127.0.0.1"\n[server]\npublic = true')
    expect(opts).toBeNull()
    expect(error?.message).toContain("Conflicting bind intent")
  })

  test("rejects type mismatches", () => {
    const invalidConfigs = [
      { toml: 'port = "nope"', message: "port must be a finite number" },
      { toml: 'host = ""', message: "host must be a non-empty string" },
      { toml: 'auth_token = ""', message: "auth_token must be a non-empty string" },
      { toml: 'tunnel = "true"', message: "tunnel must be a boolean" },
      { toml: '[server]\npublic = "true"', message: "server.public must be a boolean" },
      { toml: '[server]\ntunnel = "true"', message: "server.tunnel must be a boolean" },
      { toml: "[shell]\ncwd = 123", message: "shell.cwd must be a non-empty string" },
      { toml: '[terminal]\nfont = ""', message: "terminal.font must be a non-empty string" },
      {
        toml: "[terminal]\nfont_size = [11]",
        message: "terminal.font_size must be a positive number or [positive, positive]",
      },
      { toml: "[command]\nargv = []", message: "command.argv must be a non-empty array of strings" },
      { toml: "[command]\nargv = [1, 2]", message: "command.argv must be a non-empty array of strings" },
    ]

    for (const invalid of invalidConfigs) {
      const [error, opts] = parseTomlConfig(invalid.toml)
      expect(opts).toBeNull()
      expect(error?.message).toContain(invalid.message)
    }
  })

  test("rejects unknown theme ids", () => {
    const [error, opts] = parseTomlConfig('[terminal]\ntheme = "definitely-not-a-theme"')
    expect(opts).toBeNull()
    expect(error?.message).toContain("Unknown theme")
  })
})
