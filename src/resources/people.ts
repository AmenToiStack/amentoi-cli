import { randomUUID } from 'node:crypto'
import { Command } from 'commander'
import { clientFor, request } from '../lib/client.js'
import { id, parseBody, run, type DataOptions } from '../lib/cli.js'

const people = clientFor('people')
export const peopleResource = new Command('people').description('Manage People records in the selected workspace')

peopleResource.command('list').description('Search the People directory')
  .option('--query <text>', 'Search text').option('--limit <n>', 'Maximum results')
  .option('--json', 'Output as JSON')
  .action((opts: DataOptions & { query?: string; limit?: string }) =>
    run(() => people.get('/v1/people', { query: opts.query, limit: opts.limit }), opts))

peopleResource.command('get').description('Read one person')
  .argument('<person-id>').option('--json', 'Output as JSON')
  .action((personId: string, opts: DataOptions) => run(() => people.get(`/v1/people/${id(personId)}`), opts))

peopleResource.command('create').description('Create a person from a JSON body')
  .option('--data <json>', 'Person JSON body').option('--file <path>', 'Person JSON file')
  .option('--idempotency-key <key>', 'Stable key for safe retries; generated when omitted')
  .option('--json', 'Output as JSON')
  .action((opts: DataOptions & { idempotencyKey?: string }) => run(() =>
    request('people', 'POST', '/v1/people', parseBody(opts), undefined, {
      'Idempotency-Key': opts.idempotencyKey ?? randomUUID(),
    }), opts))

peopleResource.command('update').description('Update a person from a JSON body')
  .argument('<person-id>').option('--data <json>', 'Changes JSON').option('--file <path>', 'Changes JSON file')
  .option('--json', 'Output as JSON')
  .action((personId: string, opts: DataOptions) =>
    run(() => people.patch(`/v1/people/${id(personId)}`, parseBody(opts)), opts))

for (const action of ['archive', 'restore'] as const) {
  peopleResource.command(action).description(`${action === 'archive' ? 'Archive' : 'Restore'} a person`)
    .argument('<person-id>').option('--json', 'Output as JSON')
    .action((personId: string, opts: DataOptions) =>
      run(() => people.post(`/v1/people/${id(personId)}/${action}`), opts))
}

peopleResource.command('overview').description('Read People overview and activity')
  .option('--json', 'Output as JSON')
  .action((opts: DataOptions) => run(() => people.get('/v1/people/overview'), opts))

peopleResource.command('stats').description('Read People growth statistics')
  .option('--days <n>', 'Number of days').option('--json', 'Output as JSON')
  .action((opts: DataOptions & { days?: string }) =>
    run(() => people.get('/v1/people/stats/growth', { days: opts.days }), opts))

peopleResource.command('mail-status').description('Read the sync state of the Forms and Mail connections')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nReturns mail.state (ACTIVE or NOT_CONNECTED), lastSyncAt, lastSyncCount, pending, and the forms receipts.\nExample: amentoi-cli people mail-status --json')
  .action((opts: DataOptions) => run(() => people.get('/v1/integrations/connections'), opts))

peopleResource.command('mail-resync').description('Replay the whole directory to Amen Mail (needs people.export.write; refused while Mail is not connected)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nConnecting People to Mail needs a user session: see amentoi-cli connections --help.\nExample: amentoi-cli people mail-resync --json')
  .action((opts: DataOptions) => run(() => people.post('/v1/integrations/mail/resync'), opts))
