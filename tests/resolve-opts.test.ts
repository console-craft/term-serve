import { describe, expect, test } from "bun:test"
import { DEFAULT_SERVER_OPTS } from "@/lib/server/http"
import { resolveRuntimeOpts } from "@/resolve-opts"
import type { Opts } from "@/types/core"

/**
 * Resolves runtime options with convenient defaults for tests.
 *
 * @param {Partial<Opts>} input Test input fields.
 * @returns {Opts} Resolved options.
 */
function resolveForTest(input: {
  config?: Partial<Opts>
  cli?: Opts
  envPort?: string | undefined
  defaults?: Partial<Opts>
}): Opts {
  const [resolveError, resolved] = resolveRuntimeOpts({
    defaults: { host: DEFAULT_SERVER_OPTS.host, port: DEFAULT_SERVER_OPTS.port },
    config: input.config,
    cli: input.cli ?? {},
    envPort: input.envPort,
  })

  if (resolveError) {
    throw resolveError
  }

  return resolved
}

describe("resolveRuntimeOpts port precedence", () => {
  test("uses default port when no layer provides one", () => {
    const resolved = resolveForTest({})
    expect(resolved.port).toBe(31337)
  })

  test("config port overrides defaults", () => {
    const resolved = resolveForTest({ config: { port: 4000 } })
    expect(resolved.port).toBe(4000)
  })

  test("env PORT overrides config port", () => {
    const resolved = resolveForTest({
      config: { port: 4000 },
      envPort: "5000",
    })
    expect(resolved.port).toBe(5000)
  })

  test("cli --port overrides env PORT", () => {
    const resolved = resolveForTest({
      config: { port: 4000 },
      envPort: "5000",
      cli: { port: 6000 },
    })
    expect(resolved.port).toBe(6000)
  })
})

describe("resolveRuntimeOpts bind precedence", () => {
  test("config public applies when CLI bind flags are absent", () => {
    const resolved = resolveForTest({
      config: { public: true },
    })

    expect(resolved.host).toBe("0.0.0.0")
    expect(resolved.public).toBe(true)
  })

  test("config host applies when CLI bind flags are absent", () => {
    const resolved = resolveForTest({
      config: { host: "0.0.0.0" },
    })

    expect(resolved.host).toBe("0.0.0.0")
    expect(resolved.public).toBeUndefined()
  })

  test("cli host overrides config public as one bind group", () => {
    const resolved = resolveForTest({
      config: { public: true },
      cli: { host: "localhost" },
    })

    expect(resolved.host).toBe("localhost")
    expect(resolved.public).toBeUndefined()
  })

  test("cli public overrides config host as one bind group", () => {
    const resolved = resolveForTest({
      config: { host: "localhost" },
      cli: { public: true, host: "0.0.0.0" },
    })

    expect(resolved.host).toBe("0.0.0.0")
    expect(resolved.public).toBe(true)
  })
})

describe("resolveRuntimeOpts command precedence", () => {
  test("uses config [command].argv when CLI positional command is absent", () => {
    const resolved = resolveForTest({
      config: {
        commandToRun: "htop",
        commandArgs: ["-d", "10"],
      },
    })

    expect(resolved.commandToRun).toBe("htop")
    expect(resolved.commandArgs).toEqual(["-d", "10"])
  })

  test("cli positional command overrides config command argv as a whole", () => {
    const resolved = resolveForTest({
      config: {
        commandToRun: "htop",
        commandArgs: ["-d", "10"],
      },
      cli: {
        commandToRun: "btop",
        commandArgs: ["--utf-force"],
      },
    })

    expect(resolved.commandToRun).toBe("btop")
    expect(resolved.commandArgs).toEqual(["--utf-force"])
  })
})
