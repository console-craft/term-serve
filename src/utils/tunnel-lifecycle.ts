import type { Logger } from "@/lib/server/logger"
import type { RuntimeOpts } from "@/resolve-opts"
import type { Result } from "@/utils/safe-result"
import type { CloudflaredTunnel } from "./cloudflared-tunnel"
import * as cloudflaredTunnel from "./cloudflared-tunnel"

/**
 * Starts a Cloudflare tunnel when requested by runtime options.
 *
 * @param {RuntimeOpts} runtimeOpts Resolved runtime options.
 * @param {Bun.Server} server Started Bun server.
 * @param {Logger} log Structured logger.
 * @returns {Promise<Result<CloudflaredTunnel | undefined>>} Tunnel handle when enabled.
 */
export async function startTunnelIfRequested(
  runtimeOpts: RuntimeOpts,
  server: Bun.Server<unknown>,
  log: Logger,
): Promise<Result<CloudflaredTunnel | undefined>> {
  if (!runtimeOpts.tunnel) {
    return [null, undefined]
  }

  const targetUrl = cloudflaredTunnel.getCloudflaredTargetUrl(server.url)
  log.info("cloudflared_start", { targetUrl })

  const [tunnelError, tunnel] = await cloudflaredTunnel.startCloudflaredTunnel(targetUrl)
  if (tunnelError) {
    return [tunnelError, null]
  }

  log.info("cloudflared_ready", { url: tunnel.url })
  return [null, tunnel]
}

/**
 * Cleans up the tunnel on process exit and stops the local server if cloudflared exits unexpectedly.
 *
 * @param {CloudflaredTunnel} tunnel Cloudflare tunnel handle.
 * @param {Bun.Server} server Started Bun server.
 * @param {Logger} log Structured logger.
 * @returns {void}
 */
export function registerTunnelCleanup(tunnel: CloudflaredTunnel, server: Bun.Server<unknown>, log: Logger): void {
  let stopping = false

  process.once("exit", () => {
    stopping = true
    tunnel.stop()
  })

  void tunnel.exited.then((exitCode): void => {
    if (stopping) {
      return
    }

    log.error("cloudflared_exit", { exitCode: exitCode ?? "unknown" })
    process.exitCode = 1
    server.stop(true)
  })
}
