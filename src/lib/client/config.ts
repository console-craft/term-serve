import { asAsyncResult, type Result } from "@/utils/safe-result"

export type ServerConfig = {
  authRequired: boolean
  terminalFont?: string
  terminalFontSize?: string
  terminalTheme?: string
  ptyCwd?: string
  ptyMode?: "shell" | "command"
  ptyCommand?: string
}

/**
 * Fetches the server configuration from the `/api/config` endpoint.
 * Returns an error result when the network request or response parsing fails.
 *
 * @return {Promise<Result<ServerConfig>>} A promise that resolves to a tuple containing either an error or the parsed config.
 */
export async function fetchServerConfig(): Promise<Result<ServerConfig>> {
  const [fetchError, res] = await asAsyncResult(() => fetch("/api/config"))
  if (fetchError) {
    return [fetchError, null]
  }

  if (!res.ok) {
    return [new Error(`Failed to fetch server config (${res.status})`), null]
  }

  const [parseError, data] = await asAsyncResult(async () => (await res.json()) as Partial<ServerConfig>)
  if (parseError) {
    return [parseError, null]
  }

  const terminalFontRaw = typeof data.terminalFont === "string" ? data.terminalFont.trim() : ""
  const terminalFont = terminalFontRaw ? terminalFontRaw : undefined

  const terminalFontSizeRaw = typeof data.terminalFontSize === "string" ? data.terminalFontSize.trim() : ""
  const terminalFontSize = terminalFontSizeRaw ? terminalFontSizeRaw : undefined

  const terminalThemeRaw = typeof data.terminalTheme === "string" ? data.terminalTheme.trim() : ""
  const terminalTheme = terminalThemeRaw ? terminalThemeRaw : undefined

  const ptyCwdRaw = typeof data.ptyCwd === "string" ? data.ptyCwd.trim() : ""
  const ptyCwd = ptyCwdRaw ? ptyCwdRaw : undefined

  const ptyModeRaw = typeof data.ptyMode === "string" ? data.ptyMode.trim() : ""
  const ptyMode = ptyModeRaw === "shell" || ptyModeRaw === "command" ? ptyModeRaw : undefined

  const ptyCommandRaw = typeof data.ptyCommand === "string" ? data.ptyCommand.trim() : ""
  const ptyCommand = ptyCommandRaw ? ptyCommandRaw : undefined

  return [
    null,
    {
      authRequired: Boolean(data.authRequired),
      terminalFont,
      terminalFontSize,
      terminalTheme,
      ptyCwd,
      ptyMode,
      ptyCommand,
    },
  ]
}
