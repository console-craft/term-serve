// Embed bundled fonts into the executable (so no extra files needed at runtime)
import { asResult } from "@/utils/safe-result"
import jetbrainsMonoBoldWoff2 from "../client/fonts/jetbrains-mono-nerdfont-bold.woff2" with { type: "file" }
import jetbrainsMonoItalicWoff2 from "../client/fonts/jetbrains-mono-nerdfont-italic.woff2" with { type: "file" }
import jetbrainsMonoRegularWoff2 from "../client/fonts/jetbrains-mono-nerdfont-regular.woff2" with { type: "file" }
import nerdFontSymbolsWoff2 from "../client/fonts/symbols-nerdfont-mono.woff2" with { type: "file" }

const FONT_ASSETS_BY_BASENAME: Readonly<Record<string, string>> = {
  "jetbrains-mono-nerdfont-regular.woff2": jetbrainsMonoRegularWoff2,
  "jetbrains-mono-nerdfont-bold.woff2": jetbrainsMonoBoldWoff2,
  "jetbrains-mono-nerdfont-italic.woff2": jetbrainsMonoItalicWoff2,
  "symbols-nerdfont-mono.woff2": nerdFontSymbolsWoff2,
}

/**
 * Strips a trailing content hash segment from an asset filename.
 *
 * Example: `jetbrains-mono-nerdfont-regular-abcdef12.woff2` -> `jetbrains-mono-nerdfont-regular.woff2`
 *
 * @param {string} filename Asset filename (no path component).
 * @return {string} Filename without a trailing hash segment.
 */
function stripTrailingAssetHash(filename: string): string {
  return filename.replace(/-[a-z0-9]{6,}(?=\.woff2$)/i, "")
}

/**
 * Resolves a request pathname (with or without hash) to one of our bundled font assets.
 * Bun's CSS bundler may rewrite font URLs to hashed paths like `/jetbrains-mono-nerdfont-regular-abcdef12.woff2`.
 *
 * This helper maps both hashed and unhashed URLs to the embedded font file.
 *
 * @param {string} pathname URL pathname (e.g. `/fonts/foo.woff2` or `/foo-abcdef12.woff2`).
 * @return {{ assetPath: string; cacheControl: string } | undefined} Embedded asset info, or undefined.
 */
export function resolveBundledFontAssetForRequestedPath(
  pathname: string,
): { assetPath: string; cacheControl: string } | undefined {
  const raw = pathname.split("?")[0] || ""
  const last = raw.split("/").filter(Boolean).at(-1)
  if (!last) {
    return undefined
  }

  const [decodeFilenameError, decodedFilename] = asResult(() => decodeURIComponent(last))

  // Fall back to the raw segment if the URL contains malformed escapes.
  const filename = decodeFilenameError ? last : decodedFilename

  if (!filename.toLowerCase().endsWith(".woff2")) {
    return undefined
  }

  const nonHashedFontFilename = FONT_ASSETS_BY_BASENAME[filename]
  if (nonHashedFontFilename) {
    // The requested path is for a stable filename (no hash), we must not mark it as immutable in the response
    // so the cache can get busted after max-age expires! Since we are not sending an ETag (to save unnecessary requests)
    // and the client can't do a conditional request to check for freshness, we set a short expiration (one hour)
    // to ensure clients "eventually" refresh the resource and the cache is busted if we ever change the file's content.
    return { assetPath: nonHashedFontFilename, cacheControl: "public, max-age=3600" }
  }

  const base = stripTrailingAssetHash(filename)
  const assetPath = FONT_ASSETS_BY_BASENAME[base]
  if (!assetPath) {
    return undefined
  }

  // The requested path is for a hashed filename, so there's no need to send an ETag for the client to do a conditional
  // request to check for freshness (the filename itself IS the change condition): we can safely set a long expiration
  // (one year) because the hash will change if the content of the file changes and the cache will be busted in that case.
  // We additionally mark it as immutable to indicate not to even attempt to revalidate during the expiration window.
  return { assetPath, cacheControl: "public, max-age=31536000, immutable" }
}
