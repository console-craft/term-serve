export type InternalCommand = {
  domain: string
  subcommand: string
  subcommandArgs?: string[]
}

/**
 * Parses an internal command array representation into its components: domain, subcommand, and optional arguments.
 *
 * Internal command format: `--internal=domain:subcommand optional positional args`
 * Received: ['domain:subcommand', 'optional', 'positional', 'args']
 *
 * @param {string[]} command An array of strings representing the command and its arguments.
 * @returns {InternalCommand | undefined} An object containing the domain, subcommand, and optional arguments if the command is valid or undefined.
 */
export function parseInternalCommand(command: string[]): InternalCommand | undefined {
  const [domain, subcommand] = command[0]?.split(":") ?? []

  if (!domain || !["ai"].includes(domain) || !subcommand) {
    return
  }

  if (domain === "ai" && !["help", "login", "list-providers", "list-models", "model", "ask"].includes(subcommand)) {
    return
  }

  const subcommandArgs = command.slice(1).length > 0 ? command.slice(1) : undefined

  return { domain, subcommand, subcommandArgs }
}
