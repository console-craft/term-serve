import type { InternalCommand } from "@/utils/parse-args-utils"

export type Opts = {
  public?: boolean
  tunnel?: boolean
  verbose?: boolean
  showHelp?: boolean
  showVersion?: boolean
  listThemes?: boolean
  configPath?: string
  port?: number
  host?: string
  cwd?: string
  authToken?: string
  terminalFont?: string
  terminalFontSize?: string
  terminalTheme?: string
  commandToRun?: string
  commandArgs?: string[]
  internalCommand?: InternalCommand
}
