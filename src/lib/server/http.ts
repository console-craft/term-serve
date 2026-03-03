import { randomUUID } from "node:crypto"
import { file } from "bun"
import { asAsyncResult, asResult, type Result } from "@/utils/safe-result"
import { resolveBundledFontAssetForRequestedPath } from "./font-embedding"
import { type Logger, logAccess } from "./logger"
import type { PtyCommand } from "./pty"
import { getRemoteIPFromHeaders, getRemoteIPFromRequestIP } from "./request-origin-resolver"
import { getRoutes } from "./routes"
import { getWebSocketHandler, upgradeReqToWebSocket, type WsData } from "./websockets"

/**
 * Custom fetch handler to cover special cases that Bun's route handling can't cover.
 *
 * - The root HTML page ("/") needs to be proxied internally to the "__index" route to allow correct bundling by Bun's HTML import, and still be able to log the requests to "/".
 * - The "/ws" endpoint needs to be handled at the fetch level to allow performing the WebSocket upgrade and log the initial upgrade request (which doesn't go through the WebSocket handler).
 * - Requests for bundled font assets need to be handled at the fetch level to resolve the correct asset path based on the request URL, and to set appropriate caching headers.
 * - All other requests that don't match the defined routes will be handled with a 404 Not Found response at the end of the fetch handler.
 *
 * @param {string | undefined} authToken Optional auth token for validating WebSocket upgrade requests.
 * @param {Logger | undefined} logger Optional logger for access logging.
 * @returns {(req: Request, srv: Bun.Server<WsData>) => Promise<Response>} The fetch handler function to be used in the Bun server configuration.
 */
function getFetchHandler(authToken: string | undefined, logger: Logger | undefined) {
  return async (req: Request, srv: Bun.Server<WsData>) => {
    const startMs = performance.now()
    const reqId = randomUUID()
    const url = new URL(req.url)
    const fallbackRemoteIp = getRemoteIPFromRequestIP(srv, req)

    // Bun's HTML import needs to be served from the `routes` table to correctly handle asset bundling.
    // We log access here, but we proxy internally to the __index hidden route defined in routes to serve the actual HTML content.
    if (url.pathname === "/") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const res = new Response("Method Not Allowed", { status: 405 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      const internalUrl = new URL("/__index", srv.url)
      const internalReq = new Request(internalUrl, { method: req.method, headers: req.headers })
      const [indexFetchError, res] = await asAsyncResult(() => fetch(internalReq))
      if (indexFetchError) {
        logger?.error("http_index_proxy_failed", {
          err: indexFetchError.stack ?? indexFetchError.message,
          reqId,
          remoteIp: fallbackRemoteIp ?? "unknown",
        })

        const errorRes = new Response("Failed to serve index page", { status: 500 })
        logAccess(logger, req, errorRes.status, startMs, reqId, fallbackRemoteIp)
        return errorRes
      }

      logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
      return res
    }

    // Handle WebSocket upgrade requests at the "/ws" endpoint, which is used by the client to establish the terminal session connection.
    if (url.pathname === "/ws") {
      const [upgradeError, upgraded] = upgradeReqToWebSocket(req, srv, { authToken, log: logger, reqId })

      if (upgradeError) {
        // Unlike `logAccess`, logger.* methods do not automatically try to extract the remote IP from the request headers,
        // because you don't always need to print the remote IP (eg. when logging non-network events). In places where we need it,
        // such as here, we can extract it manually and pass it as a plain extra field to the logger.
        const remoteIp = getRemoteIPFromHeaders(req.headers) ?? fallbackRemoteIp ?? "unknown"
        logger?.error("ws_upgrade_exception", {
          err: upgradeError.stack ?? upgradeError.message,
          reqId,
          remoteIp,
        })

        const res = new Response("WebSocket upgrade failed", { status: 500 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      logAccess(logger, req, upgraded.res.status, startMs, reqId, fallbackRemoteIp, upgraded.connId)
      return upgraded.res
    }

    // Handle requests for bundled font assets, which the client may request when rendering the terminal.
    const fontAsset = resolveBundledFontAssetForRequestedPath(url.pathname)
    if (fontAsset) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const res = new Response("Method Not Allowed", { status: 405 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      const res = new Response(file(fontAsset.assetPath), {
        headers: {
          "Content-Type": "font/woff2",
          // Perf: just like when serving the Ghostty WASM above, we also tell browsers to cache the font files.
          "Cache-Control": fontAsset.cacheControl,
        },
      })
      logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
      return res
    }

    // Handle all other requests with a 404 Not Found response.
    const res = new Response("Not Found", { status: 404 })
    logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
    return res
  }
}

export type ServerOpts = {
  port: number
  host: string
  terminalFont?: string
  terminalFontSize?: string
  terminalTheme?: string
  ptyCwd?: string
  ptyCommand?: PtyCommand
  authToken?: string
  isGeneratedAuthToken?: boolean
  logger?: Logger
}

export const DEFAULT_SERVER_OPTS = {
  host: "127.0.0.1",
  port: 31337,
}

/**
 * Starts a Bun server that wires up the necessary routes, static assets and WebSocket connection to serve the terminal application.
 * Supports authentication via a Bearer token and optionally logs access via the provided logger.
 *
 * @param {ServerOpts} opts Optional configuration options for the server.
 * @return {Bun.Server<WsData>} The running Bun server instance.
 */
export function startServer(opts: ServerOpts): Result<Bun.Server<WsData>> {
  const authToken = opts.authToken
  const ptyCwd = opts.ptyCwd
  const ptyCommand = opts.ptyCommand
  const logger = opts.logger

  let server: Bun.Server<WsData> | undefined

  const [startServerError, startedServer] = asResult(() => {
    return Bun.serve<WsData>({
      port: opts.port || DEFAULT_SERVER_OPTS.port,
      hostname: opts.host || DEFAULT_SERVER_OPTS.host,
      // Routes don't automatically have access to the server instance, so we provide a getter function to allow them to
      // access the server instance and its up-to-date state when needed (e.g. for logging the remote IP of requests).
      routes: getRoutes(() => server, opts),
      fetch: getFetchHandler(authToken, logger),
      websocket: getWebSocketHandler(ptyCwd, ptyCommand, logger),
    })
  })

  // Covers EADDRINUSE and other listen errors that can happen when starting the Bun server.
  if (startServerError) {
    return [startServerError, null]
  }

  server = startedServer
  return [null, startedServer]
}
