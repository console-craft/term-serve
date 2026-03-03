import { resolve } from "node:path"
import { parseConfigObject } from "./lib/server/config-file-parser"
import type { Opts } from "./types/core"
import { asAsyncResult, asResult, type Result } from "./utils/safe-result"

const LOCAL_CONFIG_FILENAME = "term-serve.conf"

/**
 * Discovers which config file path should be used.
 *
 * @param {string | undefined} explicitPath Optional path from --config.
 * @param {string} cwd Invocation working directory.
 * @returns {Promise<Response<<string | undefined>>} Absolute config file path when discovered, undefined if no config file should be used, or an error if an explicit path was provided but invalid.
 */
export async function discoverConfigPath(
  explicitPath: string | undefined,
  cwd: string,
): Promise<Result<string | undefined>> {
  if (explicitPath) {
    const resolvedExplicitPath = resolve(cwd, explicitPath)

    const [explicitPathExistsError, explicitPathExists] = await asAsyncResult(() =>
      Bun.file(resolvedExplicitPath).exists(),
    )
    if (explicitPathExistsError) {
      return [new Error(`Unable to check config file ${explicitPath}: ${explicitPathExistsError.message}`), null]
    }

    if (!explicitPathExists) {
      return [new Error(`Config file not found: ${explicitPath}`), null]
    }

    return [null, resolvedExplicitPath]
  }

  const localPath = resolve(cwd, LOCAL_CONFIG_FILENAME)

  const [localPathExistsError, localPathExists] = await asAsyncResult(() => Bun.file(localPath).exists())
  if (localPathExistsError) {
    return [new Error(`Unable to check config file ${localPath}: ${localPathExistsError.message}`), null]
  }

  if (!localPathExists) {
    return [null, undefined]
  }

  return [null, localPath]
}

/**
 * Loads and parses one config file into CLI option overrides.
 *
 * @param {string} path Absolute or relative config file path.
 * @returns {Promise<Result<<Partial<Opts>>>} Parsed config overrides or an error if loading/parsing failed.
 */
export async function loadConfigFile(path: string): Promise<Result<Partial<Opts>>> {
  const [textError, text] = await readConfigText(path)
  if (textError) {
    return [textError, null]
  }

  const [parseTomlError, obj] = parseToml(path, text)
  if (parseTomlError) {
    return [parseTomlError, null]
  }

  const [parseConfigError, parsedOpts] = parseConfigObject(obj, path)
  if (parseConfigError) {
    return [parseConfigError, null]
  }

  return [null, parsedOpts]
}

/**
 * Reads config file text with contextual error messaging.
 *
 * @param {string} path Config file path.
 * @returns {Promise<Result<string>>} Config text.
 */
async function readConfigText(path: string): Promise<Result<string>> {
  const [readError, text] = await asAsyncResult(() => Bun.file(path).text())
  if (readError) {
    return [new Error(`Unable to read config file ${path}: ${readError.message}`), null]
  }

  return [null, text]
}

/**
 * Parses TOML text with contextual error messaging.
 *
 * @param {string} path Config file path.
 * @param {string} text Config text.
 * @returns {Result<unknown>} Parsed TOML object or parse error.
 */
function parseToml(path: string, text: string): Result<unknown> {
  const [parseError, parsedToml] = asResult(() => Bun.TOML.parse(text))
  if (parseError) {
    return [new Error(`Unable to parse config file ${path}: ${parseError.message}`), null]
  }

  return [null, parsedToml]
}
