import { randomUUID } from "node:crypto"
import type { IDisposable, IPty } from "bun-pty"
import { asResult, type Result } from "@/utils/safe-result"
import { tokenMatches } from "./auth"
import type { Logger } from "./logger"
import type { PtyCommand } from "./pty"
import { getRemoteIPFromHeaders, getRemoteIPFromRequestIP } from "./request-origin-resolver"
import { createWebSocketCloseHandler } from "./utils/websockets-close-handler"
import { createWebSocketMessageHandler } from "./utils/websockets-message-handler"
import { createWebSocketOpenHandler } from "./utils/websockets-open-handler"

export type WsData = {
  cols: number
  rows: number
  connId?: string
  reqId?: string
  remoteIp?: string
  pty?: IPty
  onData?: IDisposable
  onExit?: IDisposable
}

type UpgradeOpts = {
  authToken?: string
  log?: Logger
  reqId?: string
}

type UpgradeResult = {
  res: Response
  connId?: string
}

/**
 * Handles WebSocket upgrade requests.
 *
 * - Optionally enforces an auth token (via `?token=...`) when configured.
 * - Optionally logs upgrade attempts and reasons for denial.
 * - Reads initial terminal size from query params (`?cols=...&rows=...`) with safe defaults.
 * - Initiates the Bun WebSocket upgrade and seeds `ws.data` with the initial session state.
 *
 * @param {Request} req The incoming HTTP request to upgrade.
 * @param {Bun.Server<WsData>} srv The Bun server instance to perform the upgrade on.
 * @param {UpgradeOpts} opts Optional upgrade configuration (e.g. auth token enforcement).
 * @returns {Result<UpgradeResult>} Error/value tuple with the upgrade response.
 */
export function upgradeReqToWebSocket(
  req: Request,
  srv: Bun.Server<WsData>,
  opts: UpgradeOpts = {},
): Result<UpgradeResult> {
  const log = opts.log
  const reqId = opts.reqId

  let remoteIp = "unknown"

  const url = new URL(req.url)

  remoteIp = getRemoteIPFromHeaders(req.headers) ?? getRemoteIPFromRequestIP(srv, req) ?? "unknown"

  if (opts.authToken) {
    const provided = url.searchParams.get("token")?.trim() || ""
    if (!provided) {
      log?.warn("ws_upgrade_denied", { reason: "missing_token", reqId, remoteIp })
      return [null, { res: new Response("Missing auth token", { status: 401 }) }]
    }

    if (!tokenMatches(provided, opts.authToken)) {
      log?.warn("ws_upgrade_denied", { reason: "invalid_token", reqId, remoteIp })
      return [null, { res: new Response("Invalid auth token", { status: 403 }) }]
    }
  }

  const cols = Number(url.searchParams.get("cols") ?? "80")
  const rows = Number(url.searchParams.get("rows") ?? "24")

  const connId = randomUUID()
  const data: WsData = {
    cols: Number.isFinite(cols) ? cols : 80,
    rows: Number.isFinite(rows) ? rows : 24,
    reqId,
    connId,
    remoteIp,
  }

  const [upgradeError, wasUpgraded] = asResult(() => srv.upgrade(req, { data }))
  if (upgradeError) {
    return [upgradeError, null]
  }

  if (wasUpgraded) {
    log?.debug("ws_upgrade_succesfull", { cols: data.cols, rows: data.rows, reqId, connId, remoteIp })
    return [null, { res: new Response(null, { status: 101 }), connId }]
  }

  log?.warn("ws_upgrade_failed", { reqId, remoteIp })
  return [null, { res: new Response("WebSocket upgrade failed", { status: 400 }) }]
}

/**
 * Creates a WebSocket handler for managing terminal sessions over WebSockets.
 * This handler manages the lifecycle of a PTY session, including opening, messaging, and closing the WebSocket connection.
 * Optionally logs key events and errors during the session lifecycle using the provided logger.
 * When `ptyCommand` is provided, the PTY runs that command directly instead of starting a shell.
 *
 * @param {string | undefined} ptyCwd Optional PTY working directory.
 * @param {PtyCommand | undefined} ptyCommand Optional PTY command mode.
 * @param {Logger | undefined} log Optional logger for PTY and socket events.
 * @returns {Bun.WebSocketHandler<WsData>} WebSocket handler.
 */
export function getWebSocketHandler(
  ptyCwd?: string,
  ptyCommand?: PtyCommand,
  log?: Logger,
): Bun.WebSocketHandler<WsData> {
  return {
    open: createWebSocketOpenHandler({ ptyCwd, ptyCommand, log }),
    message: createWebSocketMessageHandler(log),
    close: createWebSocketCloseHandler(log),
  }
}
