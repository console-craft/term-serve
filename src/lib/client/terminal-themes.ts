import type { ITheme } from "ghostty-web"
import type { Result } from "@/utils/safe-result"
import { theme as andromeeda } from "./themes/andromeeda"
import { theme as auroraX } from "./themes/aurora-x"
import { theme as ayuDark } from "./themes/ayu-dark"
import { theme as catppuccinFrappe } from "./themes/catppuccin-frappe"
import { theme as catppuccinLatte } from "./themes/catppuccin-latte"
import { theme as catppuccinMacchiato } from "./themes/catppuccin-macchiato"
import { theme as catppuccinMocha } from "./themes/catppuccin-mocha"
import { theme as darkPlus } from "./themes/dark-plus"
import { theme as dracula } from "./themes/dracula"
import { theme as draculaSoft } from "./themes/dracula-soft"
import { theme as everforestDark } from "./themes/everforest-dark"
import { theme as everforestLight } from "./themes/everforest-light"
import { theme as githubDark } from "./themes/github-dark"
import { theme as githubDarkDefault } from "./themes/github-dark-default"
import { theme as githubDarkDimmed } from "./themes/github-dark-dimmed"
import { theme as githubDarkHighContrast } from "./themes/github-dark-high-contrast"
import { theme as githubLight } from "./themes/github-light"
import { theme as githubLightDefault } from "./themes/github-light-default"
import { theme as githubLightHighContrast } from "./themes/github-light-high-contrast"
import { theme as gruvboxDarkHard } from "./themes/gruvbox-dark-hard"
import { theme as gruvboxDarkMedium } from "./themes/gruvbox-dark-medium"
import { theme as gruvboxDarkSoft } from "./themes/gruvbox-dark-soft"
import { theme as gruvboxLightHard } from "./themes/gruvbox-light-hard"
import { theme as gruvboxLightMedium } from "./themes/gruvbox-light-medium"
import { theme as gruvboxLightSoft } from "./themes/gruvbox-light-soft"
import { theme as gruvwareDark } from "./themes/gruvware-dark"
import { theme as gruvwareLight } from "./themes/gruvware-light"
import { theme as houston } from "./themes/houston"
import { theme as kanagawaDragon } from "./themes/kanagawa-dragon"
import { theme as kanagawaLotus } from "./themes/kanagawa-lotus"
import { theme as kanagawaWave } from "./themes/kanagawa-wave"
import { theme as laserwave } from "./themes/laserwave"
import { theme as lightPlus } from "./themes/light-plus"
import { theme as materialTheme } from "./themes/material-theme"
import { theme as materialThemeDarker } from "./themes/material-theme-darker"
import { theme as materialThemeLighter } from "./themes/material-theme-lighter"
import { theme as materialThemeOcean } from "./themes/material-theme-ocean"
import { theme as materialThemePalenight } from "./themes/material-theme-palenight"
import { theme as minDark } from "./themes/min-dark"
import { theme as minLight } from "./themes/min-light"
import { theme as monokai } from "./themes/monokai"
import { theme as nightOwl } from "./themes/night-owl"
import { theme as nord } from "./themes/nord"
import { theme as oneDarkPro } from "./themes/one-dark-pro"
import { theme as oneLight } from "./themes/one-light"
import { theme as plastic } from "./themes/plastic"
import { theme as poimandres } from "./themes/poimandres"
import { theme as red } from "./themes/red"
import { theme as rosePine } from "./themes/rose-pine"
import { theme as rosePineDawn } from "./themes/rose-pine-dawn"
import { theme as rosePineMoon } from "./themes/rose-pine-moon"
import { theme as slackDark } from "./themes/slack-dark"
import { theme as slackOchin } from "./themes/slack-ochin"
import { theme as snazzyLight } from "./themes/snazzy-light"
import { theme as solarizedDark } from "./themes/solarized-dark"
import { theme as solarizedLight } from "./themes/solarized-light"
import { theme as synthwave84 } from "./themes/synthwave-84"
import { theme as tokyoNight } from "./themes/tokyo-night"
import { theme as vesper } from "./themes/vesper"
import { theme as vitesseBlack } from "./themes/vitesse-black"
import { theme as vitesseDark } from "./themes/vitesse-dark"
import { theme as vitesseLight } from "./themes/vitesse-light"

export const DEFAULT_TERMINAL_THEME_ID = "gruvware-dark" as const

export const TERMINAL_THEME_IDS = [
  "andromeeda",
  "aurora-x",
  "ayu-dark",
  "catppuccin-frappe",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "dark-plus",
  "dracula",
  "dracula-soft",
  "everforest-dark",
  "everforest-light",
  "github-dark",
  "github-dark-default",
  "github-dark-dimmed",
  "github-dark-high-contrast",
  "github-light",
  "github-light-default",
  "github-light-high-contrast",
  "gruvbox-dark-hard",
  "gruvbox-dark-medium",
  "gruvbox-dark-soft",
  "gruvbox-light-hard",
  "gruvbox-light-medium",
  "gruvbox-light-soft",
  "gruvware-dark",
  "gruvware-light",
  "houston",
  "kanagawa-dragon",
  "kanagawa-lotus",
  "kanagawa-wave",
  "laserwave",
  "light-plus",
  "material-theme",
  "material-theme-darker",
  "material-theme-lighter",
  "material-theme-ocean",
  "material-theme-palenight",
  "min-dark",
  "min-light",
  "monokai",
  "night-owl",
  "none",
  "nord",
  "one-dark-pro",
  "one-light",
  "plastic",
  "poimandres",
  "red",
  "rose-pine",
  "rose-pine-dawn",
  "rose-pine-moon",
  "slack-dark",
  "slack-ochin",
  "snazzy-light",
  "solarized-dark",
  "solarized-light",
  "synthwave-84",
  "tokyo-night",
  "vesper",
  "vitesse-black",
  "vitesse-dark",
  "vitesse-light",
] as const

type TerminalThemeId = (typeof TERMINAL_THEME_IDS)[number]

const TERMINAL_THEME_BY_ID: Record<Exclude<TerminalThemeId, "none">, ITheme> = {
  andromeeda: andromeeda,
  "aurora-x": auroraX,
  "ayu-dark": ayuDark,
  "catppuccin-frappe": catppuccinFrappe,
  "catppuccin-latte": catppuccinLatte,
  "catppuccin-macchiato": catppuccinMacchiato,
  "catppuccin-mocha": catppuccinMocha,
  "dark-plus": darkPlus,
  dracula: dracula,
  "dracula-soft": draculaSoft,
  "everforest-dark": everforestDark,
  "everforest-light": everforestLight,
  "github-dark": githubDark,
  "github-dark-default": githubDarkDefault,
  "github-dark-dimmed": githubDarkDimmed,
  "github-dark-high-contrast": githubDarkHighContrast,
  "github-light": githubLight,
  "github-light-default": githubLightDefault,
  "github-light-high-contrast": githubLightHighContrast,
  "gruvbox-dark-hard": gruvboxDarkHard,
  "gruvbox-dark-medium": gruvboxDarkMedium,
  "gruvbox-dark-soft": gruvboxDarkSoft,
  "gruvbox-light-hard": gruvboxLightHard,
  "gruvbox-light-medium": gruvboxLightMedium,
  "gruvbox-light-soft": gruvboxLightSoft,
  "gruvware-dark": gruvwareDark,
  "gruvware-light": gruvwareLight,
  houston: houston,
  "kanagawa-dragon": kanagawaDragon,
  "kanagawa-lotus": kanagawaLotus,
  "kanagawa-wave": kanagawaWave,
  laserwave: laserwave,
  "light-plus": lightPlus,
  "material-theme": materialTheme,
  "material-theme-darker": materialThemeDarker,
  "material-theme-lighter": materialThemeLighter,
  "material-theme-ocean": materialThemeOcean,
  "material-theme-palenight": materialThemePalenight,
  "min-dark": minDark,
  "min-light": minLight,
  monokai: monokai,
  "night-owl": nightOwl,
  nord: nord,
  "one-dark-pro": oneDarkPro,
  "one-light": oneLight,
  plastic: plastic,
  poimandres: poimandres,
  red: red,
  "rose-pine": rosePine,
  "rose-pine-dawn": rosePineDawn,
  "rose-pine-moon": rosePineMoon,
  "slack-dark": slackDark,
  "slack-ochin": slackOchin,
  "snazzy-light": snazzyLight,
  "solarized-dark": solarizedDark,
  "solarized-light": solarizedLight,
  "synthwave-84": synthwave84,
  "tokyo-night": tokyoNight,
  vesper: vesper,
  "vitesse-black": vitesseBlack,
  "vitesse-dark": vitesseDark,
  "vitesse-light": vitesseLight,
} as const

/**
 * Resolves a terminal theme by id.
 *
 * - When `id` is omitted, it resolves to the default theme.
 * - When `id` is "none", it returns `undefined` so the terminal uses its built-in defaults.
 * - When `id` is unknown, it falls back to the default theme.
 *
 * @param {string | undefined} id Theme id.
 * @returns {ITheme | undefined} Theme object for the terminal, or undefined.
 */
export function resolveTerminalTheme(id: string | undefined): ITheme | undefined {
  const v = (id ?? "").trim()

  if (v === "none") {
    return undefined
  }

  const theme = (TERMINAL_THEME_BY_ID as Record<string, ITheme | undefined>)[v]
  if (theme) {
    return theme
  }

  return TERMINAL_THEME_BY_ID[DEFAULT_TERMINAL_THEME_ID]
}

/**
 * Applies the theme background to the terminal container element.
 *
 * This avoids visible gaps between the rendered terminal canvas and its container
 * when the canvas doesn't perfectly fill all available pixels (padding/rounding).
 *
 * @param {HTMLElement} container Terminal container element.
 * @param {ITheme | undefined} theme Terminal theme.
 */
export function applyTerminalContainerBackground(container: HTMLElement, theme: ITheme | undefined): void {
  const bg = (theme?.background ?? "").trim()
  if (!bg) {
    return
  }

  container.style.backgroundColor = bg
}

/**
 * Checks whether the provided value is a supported terminal theme id.
 *
 * @param {string} value Theme id.
 * @returns {boolean} True when the theme id is supported.
 */
function isTerminalThemeId(value: string): value is TerminalThemeId {
  return (TERMINAL_THEME_IDS as readonly string[]).includes(value)
}

/**
 * Normalizes and validates a terminal theme id.
 *
 * @param {string} value Theme id.
 * @returns {Result<string>} Normalized theme id when valid, or an error when invalid.
 */
export function ensureValidTerminalThemeId(value: string): Result<string> {
  const v = value.trim()
  if (!v) {
    return [new Error("Missing value for --theme"), null]
  }

  if (!isTerminalThemeId(v)) {
    return [new Error(`Unknown theme: ${v}. Use --list-themes to see available themes.`), null]
  }

  return [null, v]
}
