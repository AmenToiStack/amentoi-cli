#!/usr/bin/env bun
import { Command } from 'commander'
import { globalFlags } from './lib/config.js'
import { authCommand } from './commands/auth.js'
import { configCommand } from './commands/config.js'
import { pagesResource } from './resources/pages.js'
import { blocksResource } from './resources/blocks.js'
import { formsResource } from './resources/forms.js'
import { submissionsResource } from './resources/submissions.js'
import { toolsResource } from './resources/tools.js'
import { apiResource } from './resources/api.js'
import { workspacesResource } from './resources/workspaces.js'
import { peopleResource } from './resources/people.js'
import { connectionsResource } from './resources/connections.js'
import { mailResource } from './resources/mail.js'

const program = new Command()
program.name('amentoi-cli')
  .description('Amen Toi services with one API key, limited by workspace permissions and product rights')
  .version('0.4.0')
  .option('--json', 'JSON envelope for agents')
  .option('--format <fmt>', 'text, json, csv, or yaml', 'text')
  .option('--verbose', 'Show debug diagnostics')
  .option('--no-color', 'Disable colors')
  .option('--no-header', 'Omit table headers')
  .option('--workspace <id>', 'Workspace ID for this command (overrides the saved selection)')
  .hook('preAction', (_command, action) => {
    const opts = action.optsWithGlobals()
    globalFlags.json = Boolean(opts.json)
    globalFlags.format = opts.format
    globalFlags.verbose = Boolean(opts.verbose)
    globalFlags.noColor = opts.color === false
    globalFlags.noHeader = opts.header === false
    globalFlags.workspace = opts.workspace
  })

for (const command of [authCommand, configCommand, workspacesResource, pagesResource, blocksResource, formsResource, submissionsResource, peopleResource, connectionsResource, mailResource, toolsResource, apiResource]) {
  program.addCommand(command)
}
program.parse()
