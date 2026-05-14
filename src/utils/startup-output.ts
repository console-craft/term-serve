import { type NetworkInterfaceInfo, networkInterfaces } from "node:os"
import qrcodeTerminal from "qrcode-terminal"
import { isLocalBindHost, normalizeHost } from "@/lib/server/utils/http-utils"

/**
 * Renders a compact terminal QR code for a URL.
 *
 * @param {string} value Value to encode.
 * @returns {string} Terminal QR code output.
 */
export function renderQrCode(value: string): string {
  let output = ""
  qrcodeTerminal.generate(value, { small: true }, (qrCode: string): void => {
    output = qrCode
  })
  return output.trimEnd()
}

/**
 * Checks whether a network interface name is likely to represent a primary LAN adapter.
 *
 * @param {string} name Interface name.
 * @returns {boolean} True when the name looks like a physical ethernet or wifi adapter.
 */
function isLikelyPrimaryLanInterface(name: string): boolean {
  return /^(en|eth|wl|wi)/i.test(name)
}

/**
 * Scores a network interface candidate so LAN-like adapters are chosen before virtual adapters.
 *
 * @param {string} name Interface name.
 * @returns {number} Lower score means a better public QR candidate.
 */
function getInterfaceScore(name: string): number {
  if (isLikelyPrimaryLanInterface(name)) {
    return 0
  }

  return 1
}

/**
 * Checks whether an interface address is IPv4.
 *
 * @param {NetworkInterfaceInfo} info Interface address details.
 * @returns {boolean} True when the address family is IPv4.
 */
function isIpv4Address(info: NetworkInterfaceInfo): boolean {
  return info.family === "IPv4"
}

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>

/**
 * Finds the best IPv4 address to advertise when the server is bound to all interfaces.
 *
 * @param {NetworkInterfaceMap} interfaces Network interfaces to inspect.
 * @returns {string | undefined} LAN IPv4 address when one can be found.
 */
export function getLanAccessHost(interfaces: NetworkInterfaceMap = networkInterfaces()): string | undefined {
  const candidates: { address: string; score: number }[] = []

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.internal || !isIpv4Address(info)) {
        continue
      }

      candidates.push({ address: info.address, score: getInterfaceScore(name) })
    }
  }

  candidates.sort((a, b) => a.score - b.score)
  return candidates[0]?.address
}

/**
 * Checks whether a bind host accepts connections on all interfaces.
 *
 * @param {string} host Hostname to inspect.
 * @returns {boolean} True when the host is a wildcard bind address.
 */
function isWildcardBindHost(host: string): boolean {
  const normalized = normalizeHost(host)
  return normalized === "0.0.0.0" || normalized === "::"
}

export type StartupAccessUrl = {
  url: string
  shouldPrintResolvedUrl: boolean
}

/**
 * Resolves the URL that should be printed and encoded as a QR code during startup.
 *
 * @param {URL} serverUrl Bun server URL.
 * @param {NetworkInterfaceMap} interfaces Network interfaces to inspect for wildcard binds.
 * @returns {StartupAccessUrl} URL metadata for startup output.
 */
export function resolveStartupAccessUrl(
  serverUrl: URL,
  interfaces: NetworkInterfaceMap = networkInterfaces(),
): StartupAccessUrl {
  const accessUrl = new URL(serverUrl.toString())

  if (isWildcardBindHost(accessUrl.hostname)) {
    const lanHost = getLanAccessHost(interfaces)

    if (lanHost) {
      accessUrl.hostname = lanHost
      return { url: accessUrl.toString(), shouldPrintResolvedUrl: true }
    }

    return { url: accessUrl.toString(), shouldPrintResolvedUrl: false }
  }

  return {
    url: accessUrl.toString(),
    shouldPrintResolvedUrl: !isLocalBindHost(accessUrl.hostname),
  }
}

/**
 * Prints startup URL and QR code information.
 *
 * @param {URL} serverUrl Bun server URL.
 * @param {NetworkInterfaceMap} interfaces Network interfaces to inspect for wildcard binds.
 * @returns {void}
 */
export function printStartupAccess(serverUrl: URL, interfaces: NetworkInterfaceMap = networkInterfaces()): void {
  const access = resolveStartupAccessUrl(serverUrl, interfaces)

  if (access.shouldPrintResolvedUrl) {
    if (access.url !== serverUrl.toString()) {
      console.log(`Resolved URL: ${access.url}\n`)

      if (process.stdout.isTTY) {
        console.log(`${renderQrCode(access.url)}\n`)
      }
    }
  }
}
