import { asResult } from "@/utils/safe-result"

/**
 * Uses Bun's `server.requestIP(request)` when available.
 *
 * This is used as a fallback for access logs when no forwarding headers are present.
 * It gets a remote IP address from direct connections, when no reverse proxy is injecting forwarding headers.
 *
 * @param {Request} req Incoming request.
 * @param {Pick<Bun.Server<unknown>, "requestIP"> | undefined} srv Bun server instance (or compatible stub).
 * @returns {string | undefined} Normalized remote IP address.
 */
export function getRemoteIPFromRequestIP(
  srv: Pick<Bun.Server<unknown>, "requestIP"> | undefined,
  req: Request,
): string | undefined {
  if (!srv) {
    return undefined
  }

  const [requestIpError, address] = asResult(() => srv.requestIP(req)?.address)
  if (requestIpError || !address) {
    return undefined
  }

  return normalizeIP(address)
}

/**
 * Returns a normalized remote from a single-value header.
 *
 * @param {Headers} headers Request headers.
 * @param {string} name Header name.
 * @returns {string | undefined} Normalized value.
 */
function getRemoteIPFromSimpleHeader(headers: Headers, name: string): string | undefined {
  const raw = headers.get(name)
  if (!raw) {
    return undefined
  }

  return normalizeIP(raw)
}

/**
 * Parses `x-forwarded-for` (a comma-separated list) and returns the first usable entry.
 *
 * @param {Headers} headers Request headers.
 * @returns {string | undefined} Normalized remote address.
 */
function getRemoteIPFromXForwardedForHeader(headers: Headers): string | undefined {
  const raw = headers.get("x-forwarded-for")
  if (!raw) {
    return undefined
  }

  for (const part of raw.split(",")) {
    const result = normalizeIP(part)
    if (result) {
      return result
    }
  }

  return undefined
}

/**
 * Normalizes a remote IP address.
 *
 * - Trims whitespace and strips surrounding quotes.
 * - Handles IPv6 bracket form (`[::1]` or `[::1]:1234`).
 * - Strips port from IPv4 `a.b.c.d:port` form.
 * - Drops empty values and the sentinel `unknown`.
 *
 * @param {string} raw Raw candidate.
 * @returns {string | undefined} Normalized value.
 */
function normalizeIP(raw: string): string | undefined {
  let v = raw.trim()
  if (!v) {
    return undefined
  }

  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    v = v.slice(1, -1)
  }

  if (!v) {
    return undefined
  }

  if (v.toLowerCase() === "unknown") {
    return undefined
  }

  const bracketPort = /^\[(.+)\]:(\d+)$/.exec(v)
  if (bracketPort) {
    return bracketPort[1]
  }

  const bracketOnly = /^\[(.+)\]$/.exec(v)
  if (bracketOnly) {
    return bracketOnly[1]
  }

  const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/.exec(v)
  if (ipv4Port) {
    return ipv4Port[1]
  }

  return v
}

/**
 * Normalizes a `Forwarded` header `for=` value.
 *
 * Examples:
 * - `for=192.0.2.60`
 * - `for="[2001:db8:cafe::17]:4711"`
 * - `for=unknown`
 * - `for=_hidden`
 *
 * @param {string} rawForValue Raw `for=` value (without the `for=` prefix).
 * @returns {string | undefined} Normalized remote address.
 */
function normalizeForwardedForValue(rawForValue: string): string | undefined {
  let v = rawForValue.trim()

  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    v = v.slice(1, -1)
  }

  // Obfuscated identifiers start with `_` per RFC 7239.
  if (v.startsWith("_")) {
    return undefined
  }

  return normalizeIP(v)
}

/**
 * Parses `Forwarded` (RFC 7239) and returns the first usable `for=` value.
 *
 * @param {Headers} headers Request headers.
 * @returns {string | undefined} Normalized remote address.
 */
function getRemoteIPFromForwardedHeader(headers: Headers): string | undefined {
  const raw = headers.get("forwarded")
  if (!raw) {
    return undefined
  }

  // Format: Forwarded: for=192.0.2.60;proto=http;by=203.0.113.43
  // Multiple entries are comma-separated, where the first represents the client.
  const entries = raw.split(",")
  for (const entry of entries) {
    const params = entry.split(";")
    for (const param of params) {
      const trimmed = param.trim()
      if (!trimmed.toLowerCase().startsWith("for=")) {
        continue
      }

      const valueRaw = trimmed.slice(4).trim()
      const result = normalizeForwardedForValue(valueRaw)
      if (result) {
        return result
      }
    }
  }

  return undefined
}

/**
 * Extracts a best-effort remote IP address from request headers.
 *
 * Header precedence (first match wins):
 * - `Forwarded` (RFC 7239)
 * - `x-forwarded-for`
 * - `cf-connecting-ip`
 * - `fly-client-ip`
 * - `true-client-ip`
 * - `x-real-ip`
 * - `x-client-ip`
 *
 * @param {Headers} headers Request headers.
 * @returns {string | undefined} Normalized remote IP address if present.
 */
export function getRemoteIPFromHeaders(headers: Headers): string | undefined {
  const forwarded = getRemoteIPFromForwardedHeader(headers)
  if (forwarded) {
    return forwarded
  }

  const xff = getRemoteIPFromXForwardedForHeader(headers)
  if (xff) {
    return xff
  }

  const cf = getRemoteIPFromSimpleHeader(headers, "cf-connecting-ip")
  if (cf) {
    return cf
  }

  const fly = getRemoteIPFromSimpleHeader(headers, "fly-client-ip")
  if (fly) {
    return fly
  }

  const trueClient = getRemoteIPFromSimpleHeader(headers, "true-client-ip")
  if (trueClient) {
    return trueClient
  }

  const xRealIp = getRemoteIPFromSimpleHeader(headers, "x-real-ip")
  if (xRealIp) {
    return xRealIp
  }

  const xClient = getRemoteIPFromSimpleHeader(headers, "x-client-ip")
  if (xClient) {
    return xClient
  }

  return undefined
}
