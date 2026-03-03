import { asAsyncResult } from "@/utils/safe-result"

const DEFAULT_TERMINAL_FONT = "TermServe Mono"
const DEFAULT_TERMINAL_FONT_SIZE = 11
const DEFAULT_TERMINAL_FONT_SIZE_MOBILE = 8
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 768

/**
 * Normalizes a user-provided font name by trimming it and removing a single layer of surrounding quotes.
 *
 * @param {string | undefined} font Font name as provided by the user.
 * @return {string | undefined} Normalized font name, or undefined if empty.
 */
function normalizeFontName(font: string | undefined): string | undefined {
  const v = (font ?? "").trim()
  if (!v) {
    return undefined
  }

  const m = /^("|')(.*)\1$/.exec(v)
  const unquoted = (m?.[2] ?? v).trim()
  return unquoted || undefined
}

/**
 * Quotes a font family name as a CSS string token.
 *
 * @param {string} family Font family name.
 * @return {string} CSS-safe quoted family name.
 */
function quoteFontFamily(family: string): string {
  return JSON.stringify(family)
}

/**
 * Preloads the terminal font(s) to reduce first-render glitches.
 *
 * @param {string | undefined} preferredFontSize Optional user-preferred font size spec in the format `SIZE[,MOBILE_SIZE]`.
 * @param {string | undefined} preferredFont Optional user-preferred font name to load in addition to the default bundled font.
 * @return {Promise<void>} Resolves when font loading is settled.
 */
export async function preloadTerminalFonts(preferredFontSize?: string, preferredFont?: string): Promise<void> {
  const fontSize = getFontSize(window.innerWidth, preferredFontSize)

  const normalizedPreferredFont = normalizeFontName(preferredFont)
  const defaultSpec = `${fontSize}px ${quoteFontFamily(DEFAULT_TERMINAL_FONT)}`

  // The Font Loading API resolves with an empty array if the font doesn't exist.
  if (normalizedPreferredFont && document.fonts) {
    const preferredSpec = `${fontSize}px ${quoteFontFamily(normalizedPreferredFont)}`
    await asAsyncResult(async () => {
      await document.fonts.load(preferredSpec)
    })
  }

  // Also preload the default bundled font to ensure it's ready when used as a fallback
  // if the preferred font doesn't exist or fails to load.
  if (document.fonts) {
    await asAsyncResult(async () => {
      await document.fonts.load(defaultSpec)
      await document.fonts.ready
    })
  }
}

/**
 * Constructs the CSS font-family string for the terminal, prioritizing the user-preferred font if provided,
 * followed by the default bundled font and a set of fallbacks.
 *
 * @param {string | undefined} terminalFont Optional user-preferred font name to use as the first choice.
 * @return {string} A CSS font-family string that can be applied to the terminal.
 */
export function getFontFamily(terminalFont?: string): string {
  const preferredFont = normalizeFontName(terminalFont)

  return [
    // Preferred font override (system-installed). If it doesn't exist, the default bundled font is used.
    ...(preferredFont ? [quoteFontFamily(preferredFont)] : []),
    // Custom bundled font.
    quoteFontFamily(DEFAULT_TERMINAL_FONT), // Bundled (patched JetBrainsMono Nerd Font Mono)
    '"TermServe Icons"', // Bundled (Nerd Font Symbols Only fallback)
    // Stable OS fallbacks.
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    '"Liberation Mono"',
    '"DejaVu Sans Mono"',
    '"Noto Sans Mono"',
    '"Ubuntu Mono"',
    '"Roboto Mono"',
    "monospace",
    // Emoji support.
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Noto Color Emoji"',
  ].join(", ")
}

/**
 * Parses a terminal font size option in the format `DEFAULT[,MOBILE]`.
 *
 * Examples:
 * - `10` -> { defaultSize: 10, mobileSize: 10 }
 * - `11,9` -> { defaultSize: 11, mobileSize: 9 }
 *
 * Invalid values return `undefined` so callers can fall back to built-in defaults.
 *
 * @param {string | undefined} spec User-provided font size spec.
 * @return {{ defaultSize: number; mobileSize: number } | undefined} Parsed sizes, or undefined if invalid.
 */
function parseTerminalFontSizeSpec(spec: string | undefined): { defaultSize: number; mobileSize: number } | undefined {
  const raw = (spec ?? "").trim()
  if (!raw) {
    return undefined
  }

  const parts = raw.split(",").map((p) => p.trim())
  if (parts.length < 1 || parts.length > 2) {
    return undefined
  }

  const defaultRaw = parts[0]
  if (!defaultRaw) {
    return undefined
  }

  const defaultSize = Number(defaultRaw)
  if (!Number.isFinite(defaultSize) || defaultSize <= 0) {
    return undefined
  }

  const mobileRaw = parts.length === 2 ? parts[1] : ""
  if (!mobileRaw) {
    return { defaultSize, mobileSize: defaultSize }
  }

  const mobileSize = Number(mobileRaw)
  if (!Number.isFinite(mobileSize) || mobileSize <= 0) {
    return undefined
  }

  return { defaultSize, mobileSize }
}

/**
 * Resolves the terminal font size (in pixels) from the user's `--font-size` option.
 * If not provided or invalid, it uses built-in defaults.
 *
 * @param {number} viewportWidthPx Current viewport width in pixels.
 * @param {string | undefined} terminalFontSizeSpec Optional `DEFAULT[,MOBILE]` size spec.
 * @return {number} Selected font size in pixels.
 */
export function getFontSize(viewportWidthPx: number, terminalFontSizeSpec?: string): number {
  const isMobile = viewportWidthPx <= MOBILE_VIEWPORT_MAX_WIDTH_PX
  const parsed = parseTerminalFontSizeSpec(terminalFontSizeSpec)

  if (parsed) {
    return isMobile ? parsed.mobileSize : parsed.defaultSize
  }

  return isMobile ? DEFAULT_TERMINAL_FONT_SIZE_MOBILE : DEFAULT_TERMINAL_FONT_SIZE
}
