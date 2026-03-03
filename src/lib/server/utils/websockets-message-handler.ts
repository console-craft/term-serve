import { asResult } from "@/utils/safe-result"
import type { Logger } from "../logger"
import { resizePty, sendToPty } from "../pty"
import type { WsData } from "../websockets"

/**
 * Parses and validates a resize protocol message.
 *
 * @param {string} msg Raw websocket message.
 * @returns {{ cols: number; rows: number } | undefined} Resize payload when valid.
 */
function parseResizeMessage(msg: string): { cols: number; rows: number } | undefined {
  const [parseError, parsed] = asResult(() => JSON.parse(msg))
  if (parseError || !parsed || parsed.type !== "resize") {
    return undefined
  }

  if (!Number.isFinite(parsed.cols) || !Number.isFinite(parsed.rows)) {
    return undefined
  }

  return { cols: parsed.cols, rows: parsed.rows }
}

/**
 * Creates the websocket `message` lifecycle handler.
 *
 * When a message is received from the WebSocket client, this function processes the message,
 * handling resize commands and forwarding keystrokes to the PTY.
 *
 * @param {Logger | undefined} log Optional logger for resize events.
 * @returns {NonNullable<Bun.WebSocketHandler<WsData>["message"]>} Message callback.
 */
export function createWebSocketMessageHandler(
  log: Logger | undefined,
): NonNullable<Bun.WebSocketHandler<WsData>["message"]> {
  return function message(ws, msg): void {
    const state = ws.data

    if (!state?.pty) {
      return
    }

    // Handle binary frames if switching away from text.
    if (typeof msg !== "string") {
      return
    }

    // Resize protocol: JSON messages like {"type":"resize","cols":...,"rows":...}.
    if (msg.startsWith("{")) {
      const resize = parseResizeMessage(msg)
      if (resize) {
        resizePty(state.pty, resize.cols, resize.rows)
        if (resize.cols !== state.cols || resize.rows !== state.rows) {
          log?.debug("pty_resize", {
            cols: resize.cols,
            rows: resize.rows,
            reqId: state.reqId,
            connId: state.connId,
            remoteIp: state.remoteIp ?? "unknown",
          })
        }

        state.cols = resize.cols
        state.rows = resize.rows
        return
      }
    }

    // Keystrokes -> PTY
    sendToPty(state.pty, msg)
  }
}
