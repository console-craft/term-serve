const gruvcraftDark = {
  foreground: "#d4be98",
  background: "#2a2928",
  cursor: "#e6d5ae",
  selectionBackground: "#d6b37b",
  selectionForeground: "#33302e",
  black: "#2a2928",
  red: "#ea6962",
  green: "#bac584",
  yellow: "#d6b37b",
  blue: "#7daea3",
  magenta: "#d3869b",
  cyan: "#89b482",
  white: "#d4be98",
  brightBlack: "#695e55",
  brightRed: "#de9880",
  brightGreen: "#a9b665",
  brightYellow: "#d8a657",
  brightBlue: "#7daea3",
  brightMagenta: "#d3869b",
  brightCyan: "#89b482",
  brightWhite: "#e6d5ae",
}

const gruvcraftLight = {
  foreground: "#3c3836",
  background: "#fbf1c7",
  cursor: "#282828",
  selectionBackground: "#d6b37b",
  selectionForeground: "#33302e",
  black: "#fdf4c1",
  red: "#cc241d",
  green: "#98971a",
  yellow: "#d79921",
  blue: "#458588",
  magenta: "#b16286",
  cyan: "#689d6a",
  white: "#7c6f64",
  brightBlack: "#928374",
  brightRed: "#9d0006",
  brightGreen: "#79740e",
  brightYellow: "#b57614",
  brightBlue: "#076678",
  brightMagenta: "#8f3f71",
  brightCyan: "#427b58",
  brightWhite: "#3c3836",
}

/**
 * Creates VS Code-compatible workbench colors from a terminal palette.
 * @param {typeof gruvcraftDark} palette Terminal color palette.
 * @returns {Record<string, string>} Workbench color map.
 */
function createWorkbenchColors(palette) {
  return {
    "activityBar.background": palette.background,
    "activityBar.foreground": palette.foreground,
    "editor.background": palette.background,
    "editor.foreground": palette.foreground,
    "editor.lineHighlightBackground": `${palette.brightBlack}33`,
    "editor.selectionBackground": palette.selectionBackground,
    "editor.selectionForeground": palette.selectionForeground,
    "editorCursor.foreground": palette.cursor,
    "editorGroupHeader.tabsBackground": palette.background,
    "editorGroupHeader.tabsBorder": palette.brightBlack,
    "editorLineNumber.activeForeground": palette.brightWhite,
    "editorLineNumber.foreground": palette.brightBlack,
    focusBorder: palette.blue,
    "scrollbarSlider.background": `${palette.brightBlack}66`,
    "scrollbarSlider.hoverBackground": `${palette.brightBlack}99`,
    "tab.activeBackground": palette.background,
    "tab.activeBorderTop": palette.blue,
    "tab.activeForeground": palette.foreground,
    "tab.border": palette.brightBlack,
    "tab.inactiveBackground": palette.black,
    "tab.inactiveForeground": palette.white,
    "terminal.ansiBlack": palette.black,
    "terminal.ansiBlue": palette.blue,
    "terminal.ansiBrightBlack": palette.brightBlack,
    "terminal.ansiBrightBlue": palette.brightBlue,
    "terminal.ansiBrightCyan": palette.brightCyan,
    "terminal.ansiBrightGreen": palette.brightGreen,
    "terminal.ansiBrightMagenta": palette.brightMagenta,
    "terminal.ansiBrightRed": palette.brightRed,
    "terminal.ansiBrightWhite": palette.brightWhite,
    "terminal.ansiBrightYellow": palette.brightYellow,
    "terminal.ansiCyan": palette.cyan,
    "terminal.ansiGreen": palette.green,
    "terminal.ansiMagenta": palette.magenta,
    "terminal.ansiRed": palette.red,
    "terminal.ansiWhite": palette.white,
    "terminal.ansiYellow": palette.yellow,
    "titleBar.activeBackground": palette.background,
    "titleBar.activeForeground": palette.foreground,
    "titleBar.border": palette.brightBlack,
  }
}

/**
 * Creates syntax token colors from a terminal palette.
 * @param {typeof gruvcraftDark} palette Terminal color palette.
 * @returns {Array<{name: string, scope: string[], settings: {foreground: string, fontStyle?: string}}>} Theme token colors.
 */
function createTokenColors(palette) {
  return [
    {
      name: "Comments",
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: palette.brightBlack, fontStyle: "italic" },
    },
    {
      name: "Keywords and storage",
      scope: ["keyword", "storage", "storage.type", "storage.modifier"],
      settings: { foreground: palette.red },
    },
    {
      name: "Strings",
      scope: ["string", "string.quoted", "string.template"],
      settings: { foreground: palette.green },
    },
    {
      name: "Numbers and constants",
      scope: ["constant", "constant.numeric", "constant.language", "support.constant"],
      settings: { foreground: palette.yellow },
    },
    {
      name: "Functions",
      scope: ["entity.name.function", "support.function", "meta.function-call", "variable.function"],
      settings: { foreground: palette.blue },
    },
    {
      name: "Types and classes",
      scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
      settings: { foreground: palette.cyan },
    },
    {
      name: "Variables and parameters",
      scope: ["variable", "variable.parameter", "meta.definition.variable"],
      settings: { foreground: palette.foreground },
    },
    {
      name: "Properties and attributes",
      scope: ["variable.other.property", "entity.other.attribute-name", "support.type.property-name"],
      settings: { foreground: palette.brightBlue },
    },
    {
      name: "Operators and punctuation",
      scope: ["keyword.operator", "punctuation", "punctuation.definition"],
      settings: { foreground: palette.white },
    },
    {
      name: "Tags",
      scope: ["entity.name.tag", "punctuation.definition.tag"],
      settings: { foreground: palette.magenta },
    },
    {
      name: "Markup headings",
      scope: ["markup.heading", "entity.name.section"],
      settings: { foreground: palette.blue, fontStyle: "bold" },
    },
    {
      name: "Markup emphasis",
      scope: ["markup.bold", "markup.italic"],
      settings: { foreground: palette.brightYellow },
    },
    {
      name: "Diff inserted",
      scope: ["markup.inserted"],
      settings: { foreground: palette.green },
    },
    {
      name: "Diff deleted",
      scope: ["markup.deleted"],
      settings: { foreground: palette.red },
    },
  ]
}

/**
 * Creates an Expressive Code compatible theme from a terminal palette.
 * @param {{name: string, type: "dark" | "light", palette: typeof gruvcraftDark}} options Theme options.
 * @returns {object} Expressive Code theme input.
 */
function createCodeTheme({ name, type, palette }) {
  return {
    name,
    type,
    semanticHighlighting: false,
    colors: createWorkbenchColors(palette),
    tokenColors: createTokenColors(palette),
  }
}

export const gruvcraftDarkCodeTheme = createCodeTheme({
  name: "gruvcraft-dark",
  type: "dark",
  palette: gruvcraftDark,
})

export const gruvcraftLightCodeTheme = createCodeTheme({
  name: "gruvcraft-light",
  type: "light",
  palette: gruvcraftLight,
})
