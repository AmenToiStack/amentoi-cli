import { Command } from 'commander'
import { userRequest, USER_TOKEN_ENV } from '../lib/client.js'
import { selectedWorkspace } from '../lib/config.js'
import { id, run, type DataOptions } from '../lib/cli.js'

const NEEDS_USER = `Needs a signed-in user session (${USER_TOKEN_ENV}); workspace API keys are refused by Core.`

function workspaceOrThrow(explicit: string | undefined, label: string): string {
  const value = explicit ?? selectedWorkspace()
  if (!value) throw new Error(`Choose the ${label} workspace with --workspace ID or the flag of this command`)
  return value
}

export const connectionsResource = new Command('connections')
  .description('Connect one organisation product to another (Core product connections, ADR-071). ' + NEEDS_USER)
  .addHelpText('after', `\n${NEEDS_USER}
Core authorizes these routes for a user with core.product.install on both sides (either side to disconnect or resync).
Closed list of pairs: forms -> link, forms -> people, people -> mail, store -> link.`)

connectionsResource.command('list').description('List the connections of a workspace and the organisations you can connect. ' + NEEDS_USER)
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli --workspace ORG_ID connections list --json')
  .action((opts: DataOptions) => run(() =>
    userRequest('GET', `/v1/workspaces/${id(workspaceOrThrow(undefined, 'current'))}/connections`), opts))

connectionsResource.command('connect').description('Connect <source> product to <consumer> product. ' + NEEDS_USER)
  .argument('<source>', 'Source product key, for example people or forms')
  .argument('<consumer>', 'Consumer product key, for example mail, people or link')
  .option('--source-workspace <id>', 'Workspace owning the source product (default: current workspace)')
  .option('--consumer-workspace <id>', 'Workspace owning the consumer product (default: current workspace)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExamples:\n  amentoi-cli --workspace ORG_ID connections connect people mail --json\n  amentoi-cli connections connect forms people --source-workspace A --consumer-workspace B --json')
  .action((source: string, consumer: string, opts: DataOptions & { sourceWorkspace?: string; consumerWorkspace?: string }) =>
    run(() => userRequest('POST', '/v1/connections', {
      sourceProductKey: source,
      sourceWorkspaceId: workspaceOrThrow(opts.sourceWorkspace, 'source'),
      consumerProductKey: consumer,
      consumerWorkspaceId: workspaceOrThrow(opts.consumerWorkspace, 'consumer'),
    }), opts))

connectionsResource.command('disconnect').description('Remove a connection; either side may. ' + NEEDS_USER)
  .argument('<connection-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli connections disconnect CONNECTION_ID --json')
  .action((connectionId: string, opts: DataOptions) =>
    run(() => userRequest('DELETE', `/v1/connections/${id(connectionId)}`), opts))

connectionsResource.command('resync').description('Ask Core to replay a people -> mail connection so People sends its whole directory to Mail again. ' + NEEDS_USER)
  .argument('<connection-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli connections resync CONNECTION_ID --json\nWith an API key, use: amentoi-cli people mail-resync (People route, needs people.export.write).')
  .action((connectionId: string, opts: DataOptions) =>
    run(() => userRequest('POST', `/v1/connections/${id(connectionId)}/resync`), opts))
