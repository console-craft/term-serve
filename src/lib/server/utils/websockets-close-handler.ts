import type { Logger } from "../logger"
import { cleanup, killRunningProcess } from "../pty"
import type { WsData } from "../websockets"

/**
 * Creates the websocket `close` lifecycle handler.
 *
 * When the WebSocket connection is closed, clean up any resources associated with the PTY session,
 * including removing event listeners and killing the PTY process.
 *
 * @param {Logger | undefined} log Optional logger for cleanup failures.
 * @returns {NonNullable<Bun.WebSocketHandler<WsData>["close"]>} Close callback.
 */
export function createWebSocketCloseHandler(
  log: Logger | undefined,
): NonNullable<Bun.WebSocketHandler<WsData>["close"]> {
  return function close(ws): void {
    const state = ws.data
    if (!state) {
      return
    }

    log?.debug("ws_close", { reqId: state.reqId, connId: state.connId, remoteIp: state.remoteIp ?? "unknown" })

    const [onDataCleanupError] = cleanup(state.onData)
    if (onDataCleanupError) {
      log?.debug("ws_cleanup_failed", {
        part: "onData",
        err: onDataCleanupError.stack ?? onDataCleanupError.message,
        reqId: state.reqId,
        connId: state.connId,
        remoteIp: state.remoteIp ?? "unknown",
      })
    }

    const [onExitCleanupError] = cleanup(state.onExit)
    if (onExitCleanupError) {
      log?.debug("ws_cleanup_failed", {
        part: "onExit",
        err: onExitCleanupError.stack ?? onExitCleanupError.message,
        reqId: state.reqId,
        connId: state.connId,
        remoteIp: state.remoteIp ?? "unknown",
      })
    }

    const [killError] = killRunningProcess(state.pty)
    if (killError) {
      log?.debug("pty_kill_failed", {
        err: killError.stack ?? killError.message,
        reqId: state.reqId,
        connId: state.connId,
        remoteIp: state.remoteIp ?? "unknown",
      })
    }
  }
}
