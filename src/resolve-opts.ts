import { DEFAULT_SERVER_OPTS } from "./lib/server/http"
import type { Opts } from "./types/core"
import type { RequireKeys } from "./types/utils"
import type { Result } from "./utils/safe-result"

type CommandIntent = {
  commandToRun: string
  commandArgs: string[]
}

/**
 * Reads command intent from one layer.
 *
 * @param {Partial<Opts>} layer One precedence layer.
 * @returns {CommandIntent | undefined} Command intent for this layer.
 */
function readCommandIntent(layer: Partial<Opts>): CommandIntent | undefined {
  if (!layer.commandToRun) {
    return undefined
  }

  return {
    commandToRun: layer.commandToRun,
    commandArgs: layer.commandArgs ?? [],
  }
}

/**
 * Resolves command intent where CLI positional command overrides config argv as a group.
 *
 * @param {Partial<Opts>} defaults Default options layer.
 * @param {Partial<Opts>} config Config options layer.
 * @param {Opts} cli CLI options layer.
 * @returns {CommandIntent | undefined} Resolved command intent.
 */
function resolveCommand(defaults: Partial<Opts>, config: Partial<Opts>, cli: Opts): CommandIntent | undefined {
  const layers = [readCommandIntent(defaults), readCommandIntent(config), readCommandIntent(cli)]

  let chosen: CommandIntent | undefined
  for (const layer of layers) {
    if (layer) {
      chosen = layer
    }
  }

  return chosen
}

type BindIntent = {
  host?: string
  public?: boolean
}

/**
 * Reads bind intent from one layer and validates host/public exclusivity.
 *
 * @param {Partial<Opts>} layer One precedence layer.
 * @param {string} layerName Layer display name for errors.
 * @returns {Result<BindIntent | undefined>} Bind intent for this layer.
 */
function readBindIntent(layer: Partial<Opts>, layerName: string): Result<BindIntent | undefined> {
  const hasHost = Object.hasOwn(layer, "host")
  const hasPublic = Object.hasOwn(layer, "public")

  if (hasHost && hasPublic) {
    if (layer.public === true && layer.host === "0.0.0.0") {
      return [null, { public: true }]
    }
    return [new Error(`Conflicting bind intent in ${layerName}: "host" and "public" cannot both be present`), null]
  }

  if (hasHost) {
    return [null, { host: layer.host }]
  }

  if (hasPublic) {
    return [null, { public: layer.public }]
  }

  return [null, undefined]
}

/**
 * Resolves host/public bind intent as one exclusive group.
 *
 * @param {Partial<Opts>} defaults Default options layer.
 * @param {Partial<Opts>} config Config options layer.
 * @param {Opts} cli CLI options layer.
 * @returns {Result<BindIntent>} Resolved bind intent.
 */
function resolveBind(defaults: Partial<Opts>, config: Partial<Opts>, cli: Opts): Result<BindIntent> {
  const [defaultsBindError, defaultsBind] = readBindIntent(defaults, "defaults")
  if (defaultsBindError) {
    return [defaultsBindError, null]
  }

  const [configBindError, configBind] = readBindIntent(config, "config")
  if (configBindError) {
    return [configBindError, null]
  }

  const [cliBindError, cliBind] = readBindIntent(cli, "cli")
  if (cliBindError) {
    return [cliBindError, null]
  }

  const layers = [defaultsBind, configBind, cliBind]

  let chosen: BindIntent | undefined
  for (const layer of layers) {
    if (layer) {
      chosen = layer
    }
  }

  if (!chosen) {
    return [null, { host: DEFAULT_SERVER_OPTS.host }]
  }

  if (chosen.public) {
    return [null, { host: "0.0.0.0", public: true }]
  }

  return [
    null,
    {
      host: chosen.host ?? DEFAULT_SERVER_OPTS.host,
      public: chosen.public,
    },
  ]
}

/**
 * Parses the PORT environment variable into a finite number.
 *
 * @param {string | undefined} value Raw PORT value.
 * @returns {number | undefined} Parsed port, or undefined when invalid.
 */
function parseEnvPort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return parsed
}

/**
 * Resolves port with defaults < config < env(PORT) < CLI precedence.
 *
 * @param {Partial<Opts>} defaults Default options layer.
 * @param {Partial<Opts>} config Config options layer.
 * @param {string | undefined} envPort Raw env PORT value.
 * @param {Opts} cli CLI options layer.
 * @returns {number | undefined} Resolved port.
 */
function resolvePort(defaults: Partial<Opts>, config: Partial<Opts>, envPort: string | undefined, cli: Opts): number {
  let port = defaults.port ?? DEFAULT_SERVER_OPTS.port

  if (config.port !== undefined) {
    port = config.port
  }

  const parsedEnvPort = parseEnvPort(envPort)
  if (parsedEnvPort !== undefined) {
    port = parsedEnvPort
  }

  if (cli.port !== undefined) {
    port = cli.port
  }

  return port
}

export type RuntimeOpts = RequireKeys<Opts, "host" | "port">

type ResolveRuntimeOptsInput = {
  defaults: Partial<Opts>
  config?: Partial<Opts>
  envPort?: string | undefined
  cli: Opts
}

/**
 * Resolves final runtime options with precedence: defaults < config < env(PORT) < CLI.
 *
 * @param {ResolveRuntimeOptsInput} input Resolution input layers.
 * @returns {Result<RuntimeOpts>} Resolved runtime options.
 */
export function resolveRuntimeOpts(input: ResolveRuntimeOptsInput): Result<RuntimeOpts> {
  const defaults = input.defaults
  const config = input.config ?? {}
  const cli = input.cli

  const resolved: Opts = {
    ...defaults,
    ...config,
    ...cli,
  }

  resolved.port = resolvePort(defaults, config, input.envPort, cli)

  const [bindError, bind] = resolveBind(defaults, config, cli)
  if (bindError) {
    return [bindError, null]
  }

  resolved.host = bind.host
  resolved.public = bind.public

  const command = resolveCommand(defaults, config, cli)
  if (command) {
    resolved.commandToRun = command.commandToRun
    resolved.commandArgs = command.commandArgs
  } else {
    resolved.commandToRun = undefined
    resolved.commandArgs = undefined
  }

  return [null, resolved as RuntimeOpts]
}
