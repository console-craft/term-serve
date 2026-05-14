/**
 * Generates a weak ETag for a Blob-like object.
 *
 * For Bun files, `lastModified` is usually available and provides a cheap revalidation token.
 * If it's not available, we fall back to size-only.
 *
 * @param {Blob} blob Response body.
 * @return {string} Weak ETag value.
 */
export function generateWeakEtag(blob: Blob): string {
  const lastModified = (blob as unknown as { lastModified?: number }).lastModified
  if (typeof lastModified === "number" && Number.isFinite(lastModified)) {
    return `W/"${blob.size}-${lastModified}"`
  }

  return `W/"${blob.size}"`
}

/**
 * Checks whether an If-None-Match header includes the current ETag.
 *
 * @param {string | null} ifNoneMatchHeader Raw header value.
 * @param {string} etag Current response ETag.
 * @return {boolean} True if the ETag matches.
 */
export function headerIfNoneMatchIncludesEtag(ifNoneMatchHeader: string | null, etag: string): boolean {
  if (!ifNoneMatchHeader) {
    return false
  }

  const raw = ifNoneMatchHeader.trim()
  if (raw === "*") {
    return true
  }

  return raw
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === etag)
}

/**
 * Normalizes a host string by trimming whitespace, converting to lowercase, and removing square brackets around IPv6 addresses.
 *
 * @param {string} host The host string to normalize.
 * @return {string} The normalized host string.
 */
export function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
}

/**
 * Determines if the provided host string represents a local bind address.
 * This is used to decide whether to enable authentication by default when no auth token is configured.
 *
 * @param {string} host The host string to check.
 * @return {boolean} True if the host is a local bind address, false otherwise.
 */
export function isLocalBindHost(host: string): boolean {
  const h = normalizeHost(host)
  return h === "127.0.0.1" || h === "localhost" || h === "::1"
}

/**
 * Determines if the provided host string represents a wildcard bind address.
 *
 * @param {string} host The host string to check.
 * @return {boolean} True if the host accepts connections on all interfaces.
 */
export function isWildcardBindHost(host: string): boolean {
  const h = normalizeHost(host)
  return h === "0.0.0.0" || h === "::"
}

/**
 * Extracts the Bearer token from the Authorization header of the request, if present.
 *
 * @param {Request} req The incoming HTTP request from which to extract the token.
 * @return {string | undefined} The extracted token if present and valid, otherwise undefined.
 */
export function getAuthTokenFromRequest(req: Request): string | undefined {
  const header = req.headers.get("authorization")
  if (!header) return undefined

  const m = /^Bearer\s+(.+)$/i.exec(header)
  const token = m?.[1]?.trim()
  return token || undefined
}
