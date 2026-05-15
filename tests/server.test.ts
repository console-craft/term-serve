import { beforeEach, describe, expect, mock, test } from "bun:test"
import { DEFAULT_SERVER_OPTS } from "@/lib/server/http"

type Disposable = { dispose: () => void }
type PtyExitData = { exitCode: number }

type PtyCommand = { file: string; args: string[] }

const calls = {
  createPty: [] as Array<{ cols: number; rows: number; cwd?: string; command?: PtyCommand }>,
  resizePty: [] as Array<[number, number]>,
  sendToPty: [] as string[],
  cleanup: [] as Array<Disposable | undefined>,
  kill: [] as unknown[],
}

let onDataCallback: ((data: string) => void) | undefined
let onExitCallback: ((data: PtyExitData) => void) | undefined
const onDataDisposable: Disposable = { dispose: () => {} }
const onExitDisposable: Disposable = { dispose: () => {} }
const ptyStub = { write: (_d: string) => {}, resize: (_c: number, _r: number) => {}, kill: () => {} }

function resetCalls(): void {
  calls.createPty.length = 0
  calls.resizePty.length = 0
  calls.sendToPty.length = 0
  calls.cleanup.length = 0
  calls.kill.length = 0
  onDataCallback = undefined
  onExitCallback = undefined
}

mock.module("@/lib/server/pty", () => ({
  createPty(cols: number, rows: number, cwd?: string, command?: PtyCommand) {
    calls.createPty.push({ cols, rows, cwd, command })
    return [null, ptyStub]
  },
  getFormattedPtyCommand(command: PtyCommand) {
    return [command.file, ...command.args]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(" ")
  },
  onPtyData(_pty: unknown, callback: (data: string) => void) {
    onDataCallback = callback
    return onDataDisposable
  },
  onPtyExit(_pty: unknown, callback: (data: PtyExitData) => void) {
    onExitCallback = callback
    return onExitDisposable
  },
  resizePty(_pty: unknown, cols: number, rows: number) {
    calls.resizePty.push([cols, rows])
  },
  sendToPty(_pty: unknown, data: string) {
    calls.sendToPty.push(data)
  },
  cleanup(resource: Disposable | undefined) {
    calls.cleanup.push(resource)
    return [null, undefined]
  },
  killRunningProcess(pty: unknown) {
    calls.kill.push(pty)
    return [null, undefined]
  },
}))

const { startServer } = await import("@/lib/server/http")
const { getWebSocketHandler, upgradeReqToWebSocket } = await import("@/lib/server/websockets")

function createFakeWs(cols?: number, rows?: number) {
  const data = typeof cols === "number" && typeof rows === "number" ? { cols, rows } : undefined

  return {
    data,
    sent: [] as string[],
    closed: 0,
    send(message: string) {
      this.sent.push(message)
    },
    close() {
      this.closed += 1
    },
  }
}

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  opts: {
    authToken?: string
    terminalFont?: string
    terminalFontSize?: string
    terminalTheme?: string
    ptyCommand?: PtyCommand
  } = {},
): Promise<void> {
  const originalPort = process.env.PORT
  delete process.env.PORT
  const server = (() => {
    for (let i = 0; i < 5; i++) {
      const port = 20000 + Math.floor(Math.random() * 20000)
      const [startServerError, server] = startServer({ host: DEFAULT_SERVER_OPTS.host, port, ...opts })
      if (startServerError) {
        if ((startServerError as Error & { code?: unknown }).code === "EADDRINUSE") {
          continue
        }
        throw startServerError
      }
      return server
    }
    const [startServerError, server] = startServer({ host: DEFAULT_SERVER_OPTS.host, port: 31338, ...opts })
    if (startServerError) {
      throw startServerError
    }
    return server
  })()

  try {
    await run(server.url.toString())
  } finally {
    server.stop(true)
    if (originalPort === undefined) delete process.env.PORT
    else process.env.PORT = originalPort
  }
}

beforeEach(() => {
  resetCalls()
})

describe("HTTP routes", () => {
  test("GET / serves HTML", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/`)
      const text = await res.text()
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/html")
      expect(text).toContain("Term Serve")
      expect(text).toContain('rel="icon"')
      expect(text).toContain('id="terminal"')
    })
  })

  test("GET favicon asset serves the app favicon", async () => {
    await withServer(async (baseUrl) => {
      const indexRes = await fetch(`${baseUrl}/`)
      const text = await indexRes.text()
      const href = text.match(/<link rel="icon" type="image\/png" href="([^"]+)"/)?.[1]

      expect(href).toBeTruthy()

      const res = await fetch(new URL(href as string, baseUrl))
      const bytes = new Uint8Array(await res.arrayBuffer())

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("image/png")
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    })
  })

  test("GET /api/status returns health and missing route is 404", async () => {
    await withServer(async (baseUrl) => {
      const statusRes = await fetch(`${baseUrl}/api/status`)
      expect(statusRes.status).toBe(200)
      expect(statusRes.headers.get("content-type")).toContain("application/json")
      expect(await statusRes.json()).toEqual({ status: "OK" })

      const missingRes = await fetch(`${baseUrl}/missing-route`)
      expect(missingRes.status).toBe(404)
      expect(await missingRes.text()).toBe("Not Found")
    })
  })

  test("GET /api/config reports authRequired false when no auth token configured", async () => {
    await withServer(async (baseUrl) => {
      const configRes = await fetch(`${baseUrl}/api/config`)
      expect(configRes.status).toBe(200)
      expect(configRes.headers.get("content-type")).toContain("application/json")
      expect(await configRes.json()).toEqual({ authRequired: false, ptyCwd: process.cwd(), ptyMode: "shell" })
    })
  })

  test("GET /api/config includes terminalFont when configured", async () => {
    await withServer(
      async (baseUrl) => {
        const configRes = await fetch(`${baseUrl}/api/config`)
        expect(configRes.status).toBe(200)
        expect(await configRes.json()).toEqual({
          authRequired: false,
          terminalFont: "Fira Code",
          ptyCwd: process.cwd(),
          ptyMode: "shell",
        })
      },
      { terminalFont: "Fira Code" },
    )
  })

  test("GET /api/config includes terminalFontSize when configured", async () => {
    await withServer(
      async (baseUrl) => {
        const configRes = await fetch(`${baseUrl}/api/config`)
        expect(configRes.status).toBe(200)
        expect(await configRes.json()).toEqual({
          authRequired: false,
          terminalFontSize: "11,9",
          ptyCwd: process.cwd(),
          ptyMode: "shell",
        })
      },
      { terminalFontSize: "11,9" },
    )
  })

  test("GET /api/config includes terminalTheme when configured", async () => {
    await withServer(
      async (baseUrl) => {
        const configRes = await fetch(`${baseUrl}/api/config`)
        expect(configRes.status).toBe(200)
        expect(await configRes.json()).toEqual({
          authRequired: false,
          terminalTheme: "tokyo-night",
          ptyCwd: process.cwd(),
          ptyMode: "shell",
        })
      },
      { terminalTheme: "tokyo-night" },
    )
  })

  test("GET /api/config reports command mode when ptyCommand is configured", async () => {
    await withServer(
      async (baseUrl) => {
        const configRes = await fetch(`${baseUrl}/api/config`)
        expect(configRes.status).toBe(200)
        expect(await configRes.json()).toEqual({
          authRequired: false,
          ptyCwd: process.cwd(),
          ptyMode: "command",
          ptyCommand: "echo hello world",
        })
      },
      { ptyCommand: { file: "echo", args: ["hello world"] } },
    )
  })

  test("GET /ghostty-vt.wasm serves wasm with content type", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/ghostty-vt.wasm`)
      const buffer = await res.arrayBuffer()
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/wasm")
      expect(buffer.byteLength).toBeGreaterThan(0)
    })
  })
})

describe("Auth endpoints", () => {
  test("/api/auth/verify is 404 when auth is disabled", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/verify`)
      expect(res.status).toBe(404)
    })
  })

  test("/api/config reports authRequired and /api/auth/verify validates token", async () => {
    await withServer(
      async (baseUrl) => {
        const configRes = await fetch(`${baseUrl}/api/config`)
        expect(await configRes.json()).toEqual({ authRequired: true, ptyCwd: process.cwd(), ptyMode: "shell" })

        const missingRes = await fetch(`${baseUrl}/api/auth/verify`)
        expect(missingRes.status).toBe(401)
        expect(await missingRes.text()).toBe("Missing auth token")

        const invalidRes = await fetch(`${baseUrl}/api/auth/verify`, {
          headers: { authorization: "Bearer wrong" },
        })
        expect(invalidRes.status).toBe(403)
        expect(await invalidRes.text()).toBe("Invalid auth token")

        const okRes = await fetch(`${baseUrl}/api/auth/verify`, {
          headers: { authorization: "Bearer test-token" },
        })
        expect(okRes.status).toBe(204)
      },
      { authToken: "test-token" },
    )
  })
})

describe("WebSocket upgrade and handler", () => {
  test("upgradeReqToWebSocket parses provided and invalid dimensions", () => {
    let data: { cols: number; rows: number } | undefined
    const srv = {
      upgrade(_req: Request, opts: { data: { cols: number; rows: number } }) {
        data = opts.data
        return true
      },
    } as unknown as Bun.Server<unknown>

    const [providedDimensionsError, providedDimensions] = upgradeReqToWebSocket(
      new Request("http://localhost/ws?cols=120&rows=40"),
      srv,
    )
    expect(providedDimensionsError).toBeNull()
    expect(providedDimensions?.res.status).toBe(101)
    expect(data).toMatchObject({ cols: 120, rows: 40 })

    const [invalidDimensionsError, invalidDimensions] = upgradeReqToWebSocket(
      new Request("http://localhost/ws?cols=Infinity&rows=NaN"),
      srv,
    )
    expect(invalidDimensionsError).toBeNull()
    expect(invalidDimensions?.res.status).toBe(101)
    expect(data).toMatchObject({ cols: 80, rows: 24 })
  })

  test("upgradeReqToWebSocket defaults to 80x24 when dimensions are missing", () => {
    let data: { cols: number; rows: number } | undefined
    const srv = {
      upgrade(_req: Request, opts: { data: { cols: number; rows: number } }) {
        data = opts.data
        return true
      },
    } as unknown as Bun.Server<unknown>

    const [missingDimensionsError, missingDimensions] = upgradeReqToWebSocket(new Request("http://localhost/ws"), srv)
    expect(missingDimensionsError).toBeNull()
    expect(missingDimensions?.res.status).toBe(101)
    expect(data).toMatchObject({ cols: 80, rows: 24 })
  })

  test("upgradeReqToWebSocket returns 400 when server upgrade fails", () => {
    const srv = {
      upgrade() {
        return false
      },
    } as unknown as Bun.Server<unknown>

    const [upgradeFailedError, upgradeFailed] = upgradeReqToWebSocket(
      new Request("http://localhost/ws?cols=80&rows=24"),
      srv,
    )
    expect(upgradeFailedError).toBeNull()
    expect(upgradeFailed?.res.status).toBe(400)
  })

  test("upgradeReqToWebSocket enforces auth token when configured", () => {
    let upgraded = 0
    const srv = {
      upgrade() {
        upgraded += 1
        return true
      },
    } as unknown as Bun.Server<unknown>

    const [missingError, missing] = upgradeReqToWebSocket(
      new Request("http://localhost/ws?cols=80&rows=24"),
      srv as never,
      {
        authToken: "secret",
      },
    )
    expect(missingError).toBeNull()
    expect(missing?.res.status).toBe(401)

    const [invalidError, invalid] = upgradeReqToWebSocket(
      new Request("http://localhost/ws?cols=80&rows=24&token=wrong"),
      srv as never,
      {
        authToken: "secret",
      },
    )
    expect(invalidError).toBeNull()
    expect(invalid?.res.status).toBe(403)

    const [okError, ok] = upgradeReqToWebSocket(
      new Request("http://localhost/ws?cols=80&rows=24&token=secret"),
      srv as never,
      {
        authToken: "secret",
      },
    )
    expect(okError).toBeNull()
    expect(ok?.res.status).toBe(101)

    expect(upgraded).toBe(1)
  })

  test("open defaults to 80x24 when ws data is missing", () => {
    const handler = getWebSocketHandler()
    expect(handler).not.toBeNull()
    const ws = createFakeWs()
    handler?.open?.(ws as never)
    expect(calls.createPty).toMatchObject([{ cols: 80, rows: 24 }])
  })

  test("open wires PTY events and forwards data", () => {
    const handler = getWebSocketHandler()
    expect(handler).not.toBeNull()
    const ws = createFakeWs(90, 30)
    handler?.open?.(ws as never)

    expect(calls.createPty).toMatchObject([{ cols: 90, rows: 30 }])
    onDataCallback?.("hello")
    expect(ws.sent).toEqual(["hello"])

    onExitCallback?.({ exitCode: 7 })
    expect(ws.sent[1]).toBe("\r\nShell exited (code: 7)\r\n")
    expect(ws.closed).toBe(1)
  })

  test("open spawns a configured command and closes on exit", () => {
    const handler = getWebSocketHandler("/tmp", {
      file: "btop",
      args: ["--utf-force"],
    })
    expect(handler).not.toBeNull()
    const ws = createFakeWs(80, 24)
    handler?.open?.(ws as never)

    expect(calls.createPty).toHaveLength(1)
    expect(calls.createPty[0]?.command).toEqual({ file: "btop", args: ["--utf-force"] })

    onExitCallback?.({ exitCode: 0 })
    expect(ws.sent[0]).toBe("\r\nCommand exited (code: 0)\r\n")
    expect(ws.closed).toBe(1)
  })

  test("message handles resize, invalid JSON fallback, and binary ignore", () => {
    const handler = getWebSocketHandler()
    expect(handler).not.toBeNull()
    const ws = createFakeWs(80, 24)
    handler?.open?.(ws as never)

    handler?.message(ws as never, JSON.stringify({ type: "resize", cols: 111, rows: 42 }))
    handler?.message(ws as never, "{invalid-json")
    handler?.message(ws as never, Buffer.from([1, 2, 3]))

    expect(calls.resizePty).toEqual([[111, 42]])
    expect(calls.sendToPty).toEqual(["{invalid-json"])
  })

  test("message is a no-op when PTY is not initialized", () => {
    const handler = getWebSocketHandler()
    expect(handler).not.toBeNull()
    const ws = createFakeWs(80, 24)

    handler?.message(ws as never, "ls")
    handler?.message(ws as never, JSON.stringify({ type: "resize", cols: 120, rows: 50 }))

    expect(calls.sendToPty).toEqual([])
    expect(calls.resizePty).toEqual([])
  })

  test("close cleans listeners and kills PTY", () => {
    const handler = getWebSocketHandler()
    expect(handler).not.toBeNull()
    const ws = createFakeWs(80, 24)
    handler?.open?.(ws as never)
    const state = ws.data as { onData?: Disposable; onExit?: Disposable; pty?: unknown }

    handler?.close?.(ws as never, 1000, "")
    expect(calls.cleanup).toEqual([state.onData, state.onExit])
    expect(calls.kill).toEqual([state.pty])
  })

  test("close is a no-op when ws has no state", () => {
    const handler = getWebSocketHandler()
    expect(handler).not.toBeNull()
    const ws = createFakeWs()

    handler?.close?.(ws as never, 1000, "")
    expect(calls.cleanup).toEqual([])
    expect(calls.kill).toEqual([])
  })
})
