import { randomUUID } from "node:crypto"
import { file } from "bun"
// Embed the WASM into the executable (so no extra files needed at runtime)
import ghosttyWasmPath from "ghostty-web/ghostty-vt.wasm" with { type: "file" }
// Bun HTML imports allow Bun.serve to use automatically bundled and optimised client assets in production mode
import html from "../client/index.html"
import { tokenMatches } from "./auth"
import type { ServerOpts } from "./http"
import { logAccess } from "./logger"
import { getFormattedPtyCommand } from "./pty"
import { getRemoteIPFromRequestIP } from "./request-origin-resolver"
import { generateWeakEtag, getAuthTokenFromRequest, headerIfNoneMatchIncludesEtag } from "./utils/http-utils"
import type { WsData } from "./websockets"

/**
 * Defines the HTTP routes and their handlers. Each route handler is responsible for processing incoming requests, performing necessary authentication and validation, and returning appropriate responses. 
 * Additionally, route handler also includes access logging using the provided logger instance, capturing request method, path, status code, response time, unique request ID, and remote IP address.

 * - `GET /__index`: Serves the main HTML page for the terminal interface.
 * - `GET /ghostty-vt.wasm`: Serves the embedded Ghostty WebAssembly module with proper caching headers and ETag support.
 * - `GET /api/status`: Returns a simple JSON response indicating the server status.
 * - `GET /api/config`: Returns the server configuration, including auth requirements and terminal settings.
 * - `POST /api/auth/verify`: Verifies the provided authentication token against the server's configured token and returns appropriate status codes for success or failure cases.
 *
 * @param {() => Bun.Server<WsData> | undefined} getServerInstance A function that returns the current Bun server instance, used for extracting remote IP addresses from requests.
 * @param {ServerOpts} opts Server options including logger, auth token, terminal theme, font, and PTY settings.
 * @returns An object mapping route paths to their respective request handlers.
 */
export function getRoutes(getServerInstance: () => Bun.Server<WsData> | undefined, opts: ServerOpts) {
  const logger = opts.logger
  const authToken = opts.authToken
  const terminalTheme = opts.terminalTheme
  const terminalFont = opts.terminalFont
  const terminalFontSize = opts.terminalFontSize
  const ptyCwd = opts.ptyCwd
  const ptyCommand = opts.ptyCommand

  return {
    // The root HTML page is served via an internal proxy route ("/" -> "__index") to allow correct bundling by Bun's HTML import,
    // and still be able to log the requests to "/". All other static assets are served directly via their own routes.
    "/__index": html,
    "/ghostty-vt.wasm": (req: Request) => {
      const startMs = performance.now()
      const reqId = randomUUID()
      const fallbackRemoteIp = getRemoteIPFromRequestIP(getServerInstance(), req)

      if (req.method !== "GET" && req.method !== "HEAD") {
        const res = new Response("Method Not Allowed", { status: 405 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      const wasmFile = file(ghosttyWasmPath)

      // Perf: tell browsers via headers to cache the resource and prevent re-downloading it every time.
      const etag = generateWeakEtag(wasmFile)
      const headers: HeadersInit = {
        "Content-Type": "application/wasm",
        // Tell browsers to cache the Ghostty WASM, but to revalidate immediately for every request via Etag.
        // The URL is stable (no hash), so we must not mark it as immutable to allow busting the chache if the content changes!
        "Cache-Control": "public, max-age=0, must-revalidate",
        // The etag specifies what should browsers consider a "change" (in our case, the file size or last modified timestamp changing).
        // We use an etag here (at the expense of some cheap conditional request from the client) instead of setting a short max-age,
        // because we want the new WASM immediately if it changes without having to wait for the max-age to expire (even if short).
        ETag: etag,
      }

      // If the client sent an If-None-Match header that matches our current ETag, respond with 304 Not Modified.
      if (headerIfNoneMatchIncludesEtag(req.headers.get("if-none-match"), etag)) {
        const res = new Response(null, { status: 304, headers })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      // Finally, serve the WASM file, including the appropriate caching instructions headers.
      const res = new Response(wasmFile, { headers })
      logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
      return res
    },
    "/api/status": (req: Request) => {
      const startMs = performance.now()
      const reqId = randomUUID()
      const fallbackRemoteIp = getRemoteIPFromRequestIP(getServerInstance(), req)
      const res = Response.json({ status: "OK" })
      logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
      return res
    },
    "/api/config": (req: Request) => {
      const startMs = performance.now()
      const reqId = randomUUID()
      const fallbackRemoteIp = getRemoteIPFromRequestIP(getServerInstance(), req)
      const res = Response.json({
        authRequired: Boolean(authToken),
        terminalFont: terminalFont || undefined,
        terminalFontSize: terminalFontSize || undefined,
        terminalTheme: terminalTheme || undefined,
        ptyCwd: ptyCwd || process.cwd(),
        ptyMode: ptyCommand ? "command" : "shell",
        ptyCommand: ptyCommand ? getFormattedPtyCommand(ptyCommand) : undefined,
      })
      logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
      return res
    },
    "/api/auth/verify": (req: Request) => {
      const startMs = performance.now()
      const reqId = randomUUID()
      const fallbackRemoteIp = getRemoteIPFromRequestIP(getServerInstance(), req)

      if (!authToken) {
        const res = new Response("Auth is not enabled", { status: 404 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      const provided = getAuthTokenFromRequest(req)
      if (!provided) {
        const res = new Response("Missing auth token", { status: 401 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      if (!tokenMatches(provided, authToken)) {
        const res = new Response("Invalid auth token", { status: 403 })
        logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
        return res
      }

      const res = new Response(null, { status: 204 })
      logAccess(logger, req, res.status, startMs, reqId, fallbackRemoteIp)
      return res
    },
  }
}
