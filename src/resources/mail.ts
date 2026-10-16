import { Command } from 'commander'
import { clientFor } from '../lib/client.js'
import { id, run, type DataOptions } from '../lib/cli.js'

const mail = clientFor('mail')
export const mailResource = new Command('mail').description('Read Amen Mail (contacts, tags, segments, campaigns). Read-only')
  .addHelpText('after', `
Read-only. Each command needs the matching mail.*.read permission on the key (mail.audience.read, mail.segment.read, mail.campaign.read).
Sending, editing and the People relay are not offered: mail.integration.write is forbidden to API keys.
Production origin https://mail.amentoi.com is built in; override it with amentoi-cli config set mail <url> (staging: https://mail.dev.amentoi.com)`)

interface ContactListOptions extends DataOptions {
  q?: string; status?: string; purpose?: string; tags?: string; tagMode?: string; excludeTag?: string
  origin?: string; basis?: string; source?: string; locale?: string; sort?: string; limit?: string
  cursor?: string; createdFrom?: string; createdTo?: string
}

const contacts = mailResource.command('contacts').description('Mail contacts with tags, consent purposes and legal basis')

contacts.command('list').description('List contacts, filtered by tag, origin, legal basis, status')
  .option('--q <text>', 'Search text (name or email)')
  .option('--status <status>', 'subscribed, unsubscribed, suppressed, bounced, complained')
  .option('--purpose <purpose>', 'newsletter or b2b_products')
  .option('--tags <ids>', 'Comma-separated tag IDs (see: mail tags list)')
  .option('--tag-mode <mode>', 'any or all, for --tags')
  .option('--exclude-tag <id>', 'Tag ID to exclude')
  .option('--origin <origin>', 'CORE_SYNC, MANUAL, CSV_IMPORT, CAPTURE, API or PEOPLE_SYNC')
  .option('--basis <basis>', 'Legal basis: CONSENT, LEGITIMATE_INTEREST or NONE')
  .option('--source <source>', 'Source label')
  .option('--locale <locale>', 'Locale such as fr-FR')
  .option('--created-from <date>', 'YYYY-MM-DD').option('--created-to <date>', 'YYYY-MM-DD')
  .option('--sort <sort>', 'created_desc, created_asc or email_asc')
  .option('--limit <n>', 'Page size, 1 to 100').option('--cursor <cursor>', 'Cursor from meta.nextCursor')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail contacts list --origin PEOPLE_SYNC --basis CONSENT --tags TAG_ID --json')
  .action((opts: ContactListOptions) => run(() => mail.get('/v1/contacts', {
    q: opts.q, status: opts.status, purpose: opts.purpose, tags: opts.tags, tagMode: opts.tagMode,
    excludeTag: opts.excludeTag, origin: opts.origin, basis: opts.basis, source: opts.source,
    locale: opts.locale, createdFrom: opts.createdFrom, createdTo: opts.createdTo,
    sort: opts.sort, limit: opts.limit, cursor: opts.cursor,
  }), opts))

contacts.command('get').description('Read one contact: tags, consents and legal basis')
  .argument('<contact-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail contacts get CONTACT_ID --json')
  .action((contactId: string, opts: DataOptions) => run(() => mail.get(`/v1/contacts/${id(contactId)}`), opts))

const tags = mailResource.command('tags').description('Mail tags (tags mirrored from People are marked system)')
tags.command('list').description('List tags with their contact counts')
  .option('--q <text>', 'Search text').option('--sort <sort>', 'count, name or recent')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail tags list --sort name --json')
  .action((opts: DataOptions & { q?: string; sort?: string }) =>
    run(() => mail.get('/v1/tags', { q: opts.q, sort: opts.sort }), opts))

const segments = mailResource.command('segments').description('Mail segments')
segments.command('list').description('List segments')
  .option('--q <text>', 'Search by name').option('--kind <kind>', 'STATIC or DYNAMIC')
  .option('--archived', 'List archived segments')
  .option('--sort <sort>', 'updated, created, name or members')
  .option('--limit <n>').option('--cursor <cursor>')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail segments list --kind DYNAMIC --json')
  .action((opts: DataOptions & { q?: string; kind?: string; archived?: boolean; sort?: string; limit?: string; cursor?: string }) =>
    run(() => mail.get('/v1/segments', {
      q: opts.q, kind: opts.kind, archived: opts.archived ? 'true' : undefined,
      sort: opts.sort, limit: opts.limit, cursor: opts.cursor,
    }), opts))

segments.command('get').description('Read one segment')
  .argument('<segment-id>').option('--json', 'Output as JSON')
  .action((segmentId: string, opts: DataOptions) => run(() => mail.get(`/v1/segments/${id(segmentId)}`), opts))

const campaigns = mailResource.command('campaigns').description('Mail campaigns (read-only: no send, schedule or edit)')
campaigns.command('list').description('List campaigns')
  .option('--status <status>', 'Campaign status')
  .option('--view <view>', 'all, draft, scheduled, sent or archived')
  .option('--q <text>', 'Search text').option('--sort <sort>', 'updated, created, scheduled, sent or name')
  .option('--limit <n>').option('--cursor <cursor>')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail campaigns list --view sent --json')
  .action((opts: DataOptions & { status?: string; view?: string; q?: string; sort?: string; limit?: string; cursor?: string }) =>
    run(() => mail.get('/v1/campaigns', {
      status: opts.status, view: opts.view, q: opts.q, sort: opts.sort, limit: opts.limit, cursor: opts.cursor,
    }), opts))

campaigns.command('get').description('Read one campaign')
  .argument('<campaign-id>').option('--json', 'Output as JSON')
  .action((campaignId: string, opts: DataOptions) => run(() => mail.get(`/v1/campaigns/${id(campaignId)}`), opts))

campaigns.command('report').description('Read the campaign report: funnel, rates and skip reasons')
  .argument('<campaign-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail campaigns report CAMPAIGN_ID --json')
  .action((campaignId: string, opts: DataOptions) => run(() => mail.get(`/v1/campaigns/${id(campaignId)}/analytics`), opts))

mailResource.command('sources').description('People to Mail sync status (null outside the Mail audience workspace)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail sources --json\nThe People side of the sync: amentoi-cli people mail-status')
  .action((opts: DataOptions) => run(() => mail.get('/v1/integrations/people'), opts))
