import { readFileSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { clientFor } from '../lib/client.js'
import { id, parseBody, run, type DataOptions } from '../lib/cli.js'

const mail = clientFor('mail')
export const mailResource = new Command('mail').description('Amen Mail: read contacts, tags, segments; draft, preview and test campaigns')
  .addHelpText('after', `
Reads need mail.audience.read, mail.segment.read or mail.campaign.read on the key. Drafting and test sends need mail.campaign.write.
Sending or scheduling to the audience is not offered: it stays a gesture in the console. The People relay is not offered: mail.integration.write is forbidden to API keys.
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

const campaigns = mailResource.command('campaigns').description('Mail campaigns: read, draft, preview, test (no send or schedule)')
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

// --- Drafting and testing. Sending to the audience stays a human gesture in the console. ---

interface MessageOptions extends DataOptions {
  name?: string; subject?: string; previewText?: string; bodyFile?: string; contentFile?: string
  purpose?: string; segment?: string; replyTo?: string
}

function messageBody(opts: MessageOptions): Record<string, unknown> {
  const body: Record<string, unknown> = opts.data || opts.file ? parseBody(opts) : {}
  if (opts.name !== undefined) body.name = opts.name
  if (opts.subject !== undefined) body.subject = opts.subject
  if (opts.previewText !== undefined) body.previewText = opts.previewText
  if (opts.bodyFile !== undefined) body.bodyMarkdown = readFileSync(opts.bodyFile, 'utf8')
  if (opts.contentFile !== undefined) body.content = JSON.parse(readFileSync(opts.contentFile, 'utf8'))
  if (opts.purpose !== undefined) body.purpose = opts.purpose
  if (opts.segment !== undefined) body.segmentId = opts.segment === 'none' ? null : opts.segment
  if (opts.replyTo !== undefined) body.replyTo = opts.replyTo === 'none' ? null : opts.replyTo
  return body
}

/** `--var key=value`, repeatable. */
function collectVar(value: string, previous: Record<string, string>): Record<string, string> {
  const index = value.indexOf('=')
  if (index < 1) throw new Error(`--var expects key=value, got "${value}"`)
  return { ...previous, [value.slice(0, index).trim()]: value.slice(index + 1) }
}

/** Merge tags still visible after rendering: the reader would see them raw. */
export function unresolvedTags(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((text) => text.match(/\{\{[^}]*\}\}/g) ?? []))]
}

const messageOptions = (command: Command) => command
  .option('--name <name>', 'Internal name')
  .option('--subject <text>', 'Subject; merge tags such as {{firstName|ami}} allowed')
  .option('--preview-text <text>', 'Inbox preview line')
  .option('--body-file <path>', 'Markdown body (bodyMarkdown)')
  .option('--content-file <path>', 'Block document JSON (content), as the console editor stores it')
  .option('--segment <id>', 'Segment ID, or none for the whole audience')
  .option('--reply-to <email>', 'Reply-to address, or none')
  .option('--data <json>', 'Raw JSON body').option('--file <path>', 'Raw JSON body file')
  .option('--json', 'Output as JSON')

messageOptions(campaigns.command('create').description('Create a DRAFT campaign (needs mail.campaign.write)'))
  .option('--purpose <purpose>', 'newsletter or b2b_products', 'newsletter')
  .addHelpText('after', `
Example: amentoi-cli mail campaigns create --name "Avent 2026" --subject "{{firstName|Bonjour}}, l'Avent commence" --body-file avent.md --json
Then: mail campaigns preview <id>, mail campaigns test <id> --to you@example.com`)
  .action((opts: MessageOptions) => run(async () => {
    const body = messageBody(opts)
    if (typeof body.name !== 'string' || body.name === '') throw new Error('--name is required')
    // `content` is only accepted by an edit: create the draft, then attach the block document.
    const { content, replyTo, ...createBody } = body
    const created = await mail.post('/v1/campaigns', createBody) as { data: { id: string } }
    if (content === undefined && replyTo === undefined) return created
    return mail.patch(`/v1/campaigns/${id(created.data.id)}`, {
      ...(content === undefined ? {} : { content }),
      ...(replyTo === undefined ? {} : { replyTo }),
    })
  }, opts))

messageOptions(campaigns.command('update').description('Edit a DRAFT campaign (needs mail.campaign.write)'))
  .argument('<campaign-id>')
  .option('--purpose <purpose>', 'newsletter or b2b_products')
  .addHelpText('after', '\nExample: amentoi-cli mail campaigns update CAMPAIGN_ID --body-file avent.md --json\nAn edit invalidates the last test: send a new one before the console lets the campaign leave.')
  .action((campaignId: string, opts: MessageOptions) => run(() => mail.patch(`/v1/campaigns/${id(campaignId)}`, messageBody(opts)), opts))

campaigns.command('preview').description('Render the email as a recipient reads it, with the recipient count')
  .argument('<campaign-id>')
  .option('--first-name <name>', 'Sample first name (default: Marie / Mary)')
  .option('--locale <locale>', 'fr-FR or en-GB', 'fr-FR')
  .option('--html <path>', 'Write the rendered HTML to this file to open it in a browser')
  .option('--json', 'Output as JSON')
  .addHelpText('after', `
Variables ({{firstName}}, {{lastName}}, {{email}}, custom fields, with |fallback) are substituted by Amen Mail,
never by Gmail or another client: check them here or with a test, never with an email sent by hand.
meta.unresolvedTags lists any tag left raw. recipients is null once the campaign has left DRAFT/SCHEDULED.
Example: amentoi-cli mail campaigns preview CAMPAIGN_ID --html /tmp/avent.html --json`)
  .action((campaignId: string, opts: DataOptions & { firstName?: string; locale?: string; html?: string }) => run(async () => {
    const result = await mail.get(`/v1/campaigns/${id(campaignId)}/preview`, { firstName: opts.firstName, locale: opts.locale }) as
      { data: { subject: string; html: string; text: string; links: string[]; recipients: unknown } }
    if (opts.html) writeFileSync(opts.html, result.data.html)
    const { subject, text, links, recipients } = result.data
    return {
      data: { subject, text, links, recipients, ...(opts.html ? { htmlFile: opts.html } : { html: result.data.html }) },
      meta: { unresolvedTags: unresolvedTags(subject, text) },
    }
  }, opts))

campaigns.command('test').description('Send a test of the current content through Amen Mail (needs mail.campaign.write)')
  .argument('<campaign-id>')
  .requiredOption('--to <email>', 'Test address (outside production, only the allowed test domains)')
  .option('--first-name <name>', 'First name for this test; default: the contact with that address, else Marie / Mary')
  .option('--var <key=value>', 'Other merge value for this test (lastName, email, custom field key); repeatable', collectVar, {})
  .option('--locale <locale>', 'fr-FR or en-GB', 'fr-FR')
  .option('--json', 'Output as JSON')
  .addHelpText('after', `
The test is rendered exactly as the send: snippets, the organisation's theme, and the merge values of the
contact with that address when there is one. Subject is prefixed [TEST], a banner says it is a test.
The console requires a test of the CURRENT content before the campaign may leave.
Example: amentoi-cli mail campaigns test CAMPAIGN_ID --to moi@paroisse.fr --first-name Pierre --var paroisse="Saint-Jean" --json
Allowed addresses: amentoi-cli mail campaigns test-recipients --json`)
  .action((campaignId: string, opts: DataOptions & { to: string; firstName?: string; var: Record<string, string>; locale?: string }) => run(() =>
    mail.post(`/v1/campaigns/${id(campaignId)}/test`, {
      to: opts.to,
      locale: opts.locale,
      ...(opts.firstName === undefined ? {} : { firstName: opts.firstName }),
      ...(Object.keys(opts.var).length === 0 ? {} : { variables: opts.var }),
    }), opts))

campaigns.command('test-recipients').description('Saved test addresses and the domains a test may go to')
  .option('--json', 'Output as JSON')
  .action((opts: DataOptions) => run(() => mail.get('/v1/campaigns/test-recipients'), opts))

mailResource.command('sources').description('People to Mail sync status (null outside the Mail audience workspace)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli mail sources --json\nThe People side of the sync: amentoi-cli people mail-status')
  .action((opts: DataOptions) => run(() => mail.get('/v1/integrations/people'), opts))
