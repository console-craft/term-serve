import { isLocalBindHost, isWildcardBindHost } from "@/lib/server/utils/http-utils"
import { asAsyncResult, asResult, type Result } from "@/utils/safe-result"
import { assertCloudflaredAvailable, consumeStream, waitForTunnelUrl } from "./cloudflared-process"

const DEFAULT_CLOUDFLARED_COMMAND = "cloudflared"
const DEFAULT_TUNNEL_TIMEOUT_MS = 30_000
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i

export type CloudflaredTunnel = {
  url: string
  exited: Promise<number | null>
  stop: () => void
}

type StartCloudflaredTunnelOptions = {
  command?: string
  timeoutMs?: number
}

/**
 * Parses a Cloudflare quick tunnel URL from cloudflared output.
 *
 * @param {string} text cloudflared output text.
 * @returns {string | undefined} Parsed tunnel URL when present.
 */
export function parseCloudflaredTunnelUrl(text: string): string | undefined {
  return text.match(TUNNEL_URL_PATTERN)?.[0]
}

/**
 * Resolves the local HTTP URL cloudflared should connect to.
 *
 * @param {URL} serverUrl Started Bun server URL.
 * @returns {string} Local target URL for cloudflared.
 */
export function getCloudflaredTargetUrl(serverUrl: URL): string {
  const targetUrl = new URL(serverUrl.toString())

  if (isLocalBindHost(targetUrl.hostname) || isWildcardBindHost(targetUrl.hostname)) {
    targetUrl.hostname = "127.0.0.1"
  }

  return targetUrl.toString()
}

/**
 * Starts a Cloudflare quick tunnel for a local HTTP URL.
 *
 * @param {string} targetUrl Local target URL for cloudflared.
 * @param {StartCloudflaredTunnelOptions} options Startup options.
 * @returns {Promise<Result<CloudflaredTunnel>>} Tunnel handle and public URL.
 */
export async function startCloudflaredTunnel(
  targetUrl: string,
  options: StartCloudflaredTunnelOptions = {},
): Promise<Result<CloudflaredTunnel>> {
  const command = options.command ?? DEFAULT_CLOUDFLARED_COMMAND
  const timeoutMs = options.timeoutMs ?? DEFAULT_TUNNEL_TIMEOUT_MS
  const [availableError] = await assertCloudflaredAvailable(command)

  if (availableError) {
    return [availableError, null]
  }

  const [spawnError, proc] = asResult(() => {
    return Bun.spawn([command, "tunnel", "--url", targetUrl], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  })

  if (spawnError) {
    return [new Error(`Failed to start cloudflared: ${spawnError.message}`), null]
  }

  const waiter = waitForTunnelUrl(proc, timeoutMs, parseCloudflaredTunnelUrl)
  consumeStream(proc.stdout, waiter.onText)
  consumeStream(proc.stderr, waiter.onText)

  const [urlError, url] = await asAsyncResult(() => waiter.promise)
  if (urlError) {
    proc.kill()
    return [urlError, null]
  }

  return [
    null,
    {
      url,
      exited: proc.exited,
      stop(): void {
        proc.kill()
      },
    },
  ]
}
