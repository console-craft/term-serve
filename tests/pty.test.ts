import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

type SpawnCall = {
  shell: string
  args: string[]
  opts: {
    name: string
    cols: number
    rows: number
    cwd: string
    env: Record<string, string>
  }
}

const spawnCalls: SpawnCall[] = []
const spawnedPty = {
  pid: 12345,
  cols: 0,
  rows: 0,
  process: "mock",
  onData() {
    return { dispose() {} }
  },
  onExit() {
    return { dispose() {} }
  },
  resize() {},
  write() {},
  kill() {},
}

mock.module("bun-pty", () => ({
  spawn(shell: string, args: string[], opts: SpawnCall["opts"]) {
    spawnCalls.push({ shell, args, opts })
    return spawnedPty
  },
}))

const { cleanup, createPty, killRunningProcess, onPtyData, onPtyExit, resizePty, sendToPty } = await import(
  "@/lib/server/pty"
)

const originalPlatform = process.platform
let envSnapshot: Record<string, string | undefined>

function setPlatform(platform: NodeJS.Platform): void {
  ;(process as unknown as { platform: NodeJS.Platform }).platform = platform
}

function snapshotEnv(): Record<string, string | undefined> {
  const next: Record<string, string | undefined> = {}
  for (const key of Object.keys(process.env)) {
    next[key] = process.env[key]
  }
  return next
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key]
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

beforeEach(() => {
  spawnCalls.length = 0
  envSnapshot = snapshotEnv()
})

afterEach(() => {
  setPlatform(originalPlatform)
  restoreEnv(envSnapshot)
})

describe("createPty", () => {
  test("uses SHELL and forwards spawn options/env", () => {
    setPlatform("linux")
    process.env.SHELL = "/bin/zsh"
    process.env.PTY_TEST_KEEP = "keep"
    process.env.TERM = "vt100"
    process.env.COLORTERM = "false"

    const [ptyError, pty] = createPty(111, 37)
    expect(spawnCalls).toHaveLength(1)
    // biome-ignore lint/style/noNonNullAssertion: test will fail if spawnCalls[0] is undefined, so this is safe.
    const call = spawnCalls[0]!

    expect(ptyError).toBeNull()
    expect(pty).toBe(spawnedPty)
    expect(call.shell).toBe("/bin/zsh")
    expect(call.args).toEqual([])
    expect(call.opts.name).toBe("xterm-256color")
    expect(call.opts.cols).toBe(111)
    expect(call.opts.rows).toBe(37)
    expect(call.opts.cwd).toBe(process.cwd())
    expect(call.opts.env.PTY_TEST_KEEP).toBe("keep")
    expect(call.opts.env.TERM).toBe("xterm-256color")
    expect(call.opts.env.COLORTERM).toBe("truecolor")
    expect(call.opts.env.WEZTERM_SHELL_SKIP_USER_VARS).toBe("1")
    expect(call.opts.env.WEZTERM_SHELL_SKIP_SEMANTIC_ZONES).toBe("1")
  })

  test("uses provided cwd when set", () => {
    setPlatform("linux")
    process.env.SHELL = "/bin/bash"

    createPty(80, 24, "/tmp")
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.opts.cwd).toBe("/tmp")
  })

  test("spawns a provided command instead of a shell", () => {
    setPlatform("linux")
    process.env.SHELL = "/bin/zsh"

    createPty(120, 40, "/var", { file: "top", args: ["-d", "10"] })
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.shell).toBe("top")
    expect(spawnCalls[0]?.args).toEqual(["-d", "10"])
    expect(spawnCalls[0]?.opts.cwd).toBe("/var")
  })

  test("falls back to /bin/bash on unix when SHELL is missing", () => {
    setPlatform("linux")
    delete process.env.SHELL

    createPty(80, 24)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.shell).toBe("/bin/bash")
  })

  test("uses COMSPEC on win32", () => {
    setPlatform("win32")
    process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe"

    createPty(80, 24)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.shell).toBe("C:\\Windows\\System32\\cmd.exe")
  })

  test("falls back to cmd.exe on win32 when COMSPEC is missing", () => {
    setPlatform("win32")
    delete process.env.COMSPEC

    createPty(80, 24)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0]?.shell).toBe("cmd.exe")
  })
})

describe("PTY wrappers", () => {
  test("onPtyData returns disposable from pty.onData", () => {
    let wiredCallback: ((data: string) => void) | undefined
    const disposable = { dispose() {} }
    const pty = {
      onData(callback: (data: string) => void) {
        wiredCallback = callback
        return disposable
      },
    }

    const callback = () => {}
    const result = onPtyData(pty as never, callback)

    expect(result).toBe(disposable)
    expect(wiredCallback).toBe(callback)
  })

  test("onPtyExit returns disposable from pty.onExit", () => {
    let wiredCallback: ((data: { exitCode: number }) => void) | undefined
    const disposable = { dispose() {} }
    const pty = {
      onExit(callback: (data: { exitCode: number }) => void) {
        wiredCallback = callback
        return disposable
      },
    }

    const callback = () => {}
    const result = onPtyExit(pty as never, callback)

    expect(result).toBe(disposable)
    expect(wiredCallback).toBe(callback)
  })

  test("resizePty forwards cols/rows to pty.resize", () => {
    const calls: Array<[number, number]> = []
    const pty = {
      resize(cols: number, rows: number) {
        calls.push([cols, rows])
      },
    }

    resizePty(pty as never, 120, 40)
    expect(calls).toEqual([[120, 40]])
  })

  test("sendToPty forwards data to pty.write", () => {
    const calls: string[] = []
    const pty = {
      write(data: string) {
        calls.push(data)
      },
    }

    sendToPty(pty as never, "ls -la\n")
    expect(calls).toEqual(["ls -la\n"])
  })

  test("killRunningProcess is safe for undefined and kills when present", () => {
    let killCalls = 0
    const pty = {
      kill() {
        killCalls += 1
      },
    }

    killRunningProcess(undefined)
    killRunningProcess(pty as never)

    expect(killCalls).toBe(1)
  })

  test("cleanup is safe for undefined and disposes when present", () => {
    let disposeCalls = 0
    const resource = {
      dispose() {
        disposeCalls += 1
      },
    }

    cleanup(undefined)
    cleanup(resource as never)

    expect(disposeCalls).toBe(1)
  })
})
