import { Command } from 'commander'
import { clientFor } from '../lib/client.js'
import { id, parseBody, run, type DataOptions } from '../lib/cli.js'

const forms = clientFor('forms')
export const formsResource = new Command('forms').description('Manage Forms')

interface PeopleOptions { sendToPeople?: boolean; respondentTags?: string }
type FormData = DataOptions & PeopleOptions
type Settings = Record<string, unknown>
type PeopleSettings = { sendToPeople: boolean; respondentTags: string[] }

const OWNER_TAGS_MAX = 20

function withPeopleOptions(command: Command): Command {
  return command
    .option('--send-to-people', 'Send respondents to People (the default for a new form)')
    .option('--no-send-to-people', 'Do not send respondents to People')
    .option('--respondent-tags <tags>', 'Comma-separated tags applied to every respondent in People (max 20); an empty string clears them')
}

function hasPeopleOptions(opts: PeopleOptions): boolean {
  return opts.sendToPeople !== undefined || opts.respondentTags !== undefined
}

function parseTags(raw: string): string[] {
  const tags = raw.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '')
  if (tags.length > OWNER_TAGS_MAX) throw new Error(`At most ${OWNER_TAGS_MAX} respondent tags`)
  return tags
}

function currentPeople(settings: Settings | undefined): PeopleSettings {
  const people = settings?.people as Partial<PeopleSettings> | undefined
  return { sendToPeople: people?.sendToPeople ?? true, respondentTags: people?.respondentTags ?? [] }
}

/** Forms replaces the whole settings object on update, so the people block is merged onto the current settings first. */
function mergePeople(base: Settings | undefined, opts: PeopleOptions): Settings {
  const people = currentPeople(base)
  return {
    ...base,
    people: {
      sendToPeople: opts.sendToPeople ?? people.sendToPeople,
      respondentTags: opts.respondentTags === undefined ? people.respondentTags : parseTags(opts.respondentTags),
    },
  }
}

formsResource.command('list').description('List forms in the workspace')
  .option('--limit <n>').option('--cursor <cursor>').option('--search <text>')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli forms list --limit 25 --json')
  .action((opts: DataOptions & { limit?: string; cursor?: string; search?: string }) =>
    run(() => forms.get('/v1/forms', { limit: opts.limit, cursor: opts.cursor, search: opts.search }), opts))

formsResource.command('get').description('Get one form, including whether respondents go to People and their tags')
  .argument('<form-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli forms get FORM_ID --json\nThe people block shows sendToPeople and respondentTags.')
  .action((formId: string, opts: DataOptions) => run(async () => {
    const result = await forms.get(`/v1/forms/${id(formId)}`) as { data?: Record<string, unknown>; meta?: Record<string, unknown> }
    if (!result.data) return result
    return { ...result, data: { ...result.data, people: currentPeople(result.data.settings as Settings | undefined) } }
  }, opts))

withPeopleOptions(formsResource.command('create').description('Create a form from a JSON body including name, slug, and schema')
  .option('--data <json>', 'Form JSON body').option('--file <path>', 'Form JSON file')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli forms create --file form.json --respondent-tags membre,2026 --json\nPeople settings default to on with no tags. They are written to settings.people.'))
  .action((opts: FormData) => run(() => {
    const body = parseBody(opts)
    if (hasPeopleOptions(opts)) body.settings = mergePeople(body.settings as Settings | undefined, opts)
    return forms.post('/v1/forms', body)
  }, opts))

withPeopleOptions(formsResource.command('update').description('Update a form draft from a JSON body and/or People flags')
  .argument('<form-id>').option('--data <json>', 'Form JSON body').option('--file <path>', 'Form JSON file')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli forms update FORM_ID --no-send-to-people --json\nExample: amentoi-cli forms update FORM_ID --respondent-tags membre,benevole --json\nThe People flags keep the form\'s other settings: the current settings are read and merged first.'))
  .action((formId: string, opts: FormData) => run(async () => {
    const body = opts.data || opts.file || !hasPeopleOptions(opts) ? parseBody(opts) : {}
    if (hasPeopleOptions(opts)) {
      let base = body.settings as Settings | undefined
      if (base === undefined) {
        const current = await forms.get(`/v1/forms/${id(formId)}`) as { data?: { settings?: Settings } }
        base = current.data?.settings
      }
      body.settings = mergePeople(base, opts)
    }
    return forms.patch(`/v1/forms/${id(formId)}`, body)
  }, opts))

formsResource.command('publish').description('Publish the current form draft')
  .argument('<form-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli forms publish FORM_ID --json')
  .action((formId: string, opts: DataOptions) =>
    run(() => forms.post(`/v1/forms/${id(formId)}/versions`), opts))

formsResource.command('stats').description('Read the Forms dashboard')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli forms stats --json')
  .action((opts: DataOptions) => run(() => forms.get('/v1/dashboard'), opts))
