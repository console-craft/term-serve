import type { IPty } from "bun-pty"
import { asResult } from "@/utils/safe-result"
import type { Logger } from "../logger"
import { createPty, onPtyData, onPtyExit, type PtyCommand } from "../pty"
import type { WsData } from "../websockets"

type OpenContext = {
  cols: number
  rows: number
  reqId?: string
  connId?: string
  remoteIp: string
}

/**
 * Creates the PTY exit subscription that reports exit status and closes the websocket.
 *
 * @param {Bun.ServerWebSocket<WsData>} ws WebSocket connection.
 * @param {IPty} pty Spawned PTY instance.
 * @param {PtyCommand | undefined} ptyCommand Optional command mode.
 * @param {Logger | undefined} log Optional logger.
 * @param {OpenContext} context Connection context for logs.
 * @returns {ReturnType<typeof onPtyExit>} PTY exit subscription.
 */
function createPtyExitSubscription(
  ws: Bun.ServerWebSocket<WsData>,
  pty: IPty,
  ptyCommand: PtyCommand | undefined,
  log: Logger | undefined,
  context: OpenContext,
): ReturnType<typeof onPtyExit> {
  return onPtyExit(pty, ({ exitCode }) => {
    log?.info("pty_exit", { exitCode, reqId: context.reqId, connId: context.connId, remoteIp: context.remoteIp })

    const [exitMessageError] = asResult(() =>
      ws.send(`\r\n${ptyCommand ? "Command" : "Shell"} exited (code: ${exitCode})\r\n`),
    )
    if (exitMessageError) {
      log?.debug("ws_send_exit_msg_failed", {
        err: exitMessageError.stack ?? exitMessageError.message,
        reqId: context.reqId,
        connId: context.connId,
        remoteIp: context.remoteIp,
      })
    }

    const [closeError] = asResult(() => ws.close())
    if (closeError) {
      log?.debug("ws_close_failed", {
        err: closeError.stack ?? closeError.message,
        reqId: context.reqId,
        connId: context.connId,
        remoteIp: context.remoteIp,
      })
    }
  })
}

/**
 * Creates the PTY data subscription that forwards output to the websocket.
 *
 * @param {Bun.ServerWebSocket<WsData>} ws WebSocket connection.
 * @param {IPty} pty Spawned PTY instance.
 * @param {Logger | undefined} log Optional logger for send failures.
 * @param {OpenContext} context Connection context for logs.
 * @returns {ReturnType<typeof onPtyData>} PTY data subscription.
 */
function createPtyDataSubscription(
  ws: Bun.ServerWebSocket<WsData>,
  pty: IPty,
  log: Logger | undefined,
  context: OpenContext,
): ReturnType<typeof onPtyData> {
  let wsSendBroken = false

  // PTY -> WebSocket Client
  return onPtyData(pty, (data) => {
    if (wsSendBroken) {
      return
    }

    const [sendError] = asResult(() => ws.send(data))
    if (sendError) {
      wsSendBroken = true
      log?.debug("ws_send_failed", {
        err: sendError.stack ?? sendError.message,
        reqId: context.reqId,
        connId: context.connId,
        remoteIp: context.remoteIp,
      })
    }
  })
}

/**
 * Logs successful PTY spawn.
 *
 * @param {Logger | undefined} log Optional logger for the spawn success event.
 * @param {OpenContext} context Connection context for logs.
 * @param {string} cwdWithFallback The working directory used for the PTY spawn attempt, with a fallback to `process.cwd()`.
 * @param {PtyCommand | undefined} ptyCommand Optional command that was attempted for the PTY spawn.
 * @returns {void}
 */
function logPtySpawnSuccess(
  log: Logger | undefined,
  context: OpenContext,
  cwdWithFallback: string,
  ptyCommand: PtyCommand | undefined,
): void {
  log?.info("pty_spawn", {
    cols: context.cols,
    rows: context.rows,
    cwd: cwdWithFallback,
    mode: ptyCommand ? "command" : "shell",
    cmd: ptyCommand?.file,
    cmdArgsCount: ptyCommand?.args.length,
    reqId: context.reqId,
    connId: context.connId,
    remoteIp: context.remoteIp,
  })

  if (ptyCommand && log && log.isVerbose) {
    log.debug("pty_spawn_argv", {
      argv: [ptyCommand.file, ...ptyCommand.args].join(" "),
      reqId: context.reqId,
      connId: context.connId,
      remoteIp: context.remoteIp,
    })
  }
}

/**
 * Sends a PTY spawn failure message and closes the websocket.
 *
 * @param {Bun.ServerWebSocket<WsData>} ws WebSocket connection.
 * @param {string} cwdWithFallback The working directory used for the PTY spawn attempt, with a fallback to `process.cwd()`.
 * @param {PtyCommand | undefined} ptyCommand Optional command that was attempted for the PTY spawn.
 * @returns {void}
 */
function notifyPtySpawnFailure(
  ws: Bun.ServerWebSocket<WsData>,
  cwdWithFallback: string,
  ptyCommand: PtyCommand | undefined,
): void {
  asResult(() => {
    if (ptyCommand) {
      ws.send(`Failed to run command: ${ptyCommand.file} (cwd: ${cwdWithFallback}).\r\n`)
    } else {
      ws.send(`Failed to start shell (cwd: ${cwdWithFallback}).\r\n`)
    }
  })

  asResult(() => ws.close())
}

type OpenHandlerOpts = {
  ptyCwd?: string
  ptyCommand?: PtyCommand
  log?: Logger
}

/**
 * Creates the websocket `open` lifecycle handler.
 *
 * @param {OpenHandlerOpts} opts Open handler dependencies.
 * @returns {NonNullable<Bun.WebSocketHandler<WsData>["open"]>} Open callback.
 */
export function createWebSocketOpenHandler(opts: OpenHandlerOpts): NonNullable<Bun.WebSocketHandler<WsData>["open"]> {
  return function open(ws): void {
    const state = ws.data
    const context: OpenContext = {
      cols: state?.cols ?? 80,
      rows: state?.rows ?? 24,
      reqId: state?.reqId,
      connId: state?.connId,
      remoteIp: state?.remoteIp ?? "unknown",
    }

    const log = opts.log

    log?.debug("ws_open", { ...context })

    const cwdWithFallback = opts.ptyCwd ?? process.cwd()
    const [ptyError, pty] = createPty(context.cols, context.rows, opts.ptyCwd, opts.ptyCommand)
    if (ptyError || !pty) {
      log?.warn("pty_spawn_failed", {
        err: ptyError ? (ptyError.stack ?? ptyError.message) : "Unknown PTY spawn error",
        cols: context.cols,
        rows: context.rows,
        cwd: cwdWithFallback,
        mode: opts.ptyCommand ? "command" : "shell",
        cmd: opts.ptyCommand?.file,
        cmdArgsCount: opts.ptyCommand?.args.length,
        reqId: context.reqId,
        connId: context.connId,
        remoteIp: context.remoteIp,
      })

      notifyPtySpawnFailure(ws, cwdWithFallback, opts.ptyCommand)
      return
    }

    logPtySpawnSuccess(log, context, cwdWithFallback, opts.ptyCommand)

    const onData = createPtyDataSubscription(ws, pty, log, context)
    const onExit = createPtyExitSubscription(ws, pty, opts.ptyCommand, log, context)
    ws.data = { ...ws.data, cols: context.cols, rows: context.rows, pty, onData, onExit }
  }
}
