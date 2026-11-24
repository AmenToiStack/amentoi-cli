import { Command } from 'commander'
import { clientFor } from '../lib/client.js'
import { id, parseBody, run, type DataOptions } from '../lib/cli.js'
import { pageRef } from '../lib/pages.js'

const link = clientFor('link')
export const pagesResource = new Command('pages').description('Manage Link profile pages')

pagesResource.command('list').description('List profile pages')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli pages list --json')
  .action((opts: DataOptions) => run(() => link.get('/v1/link/pages'), opts))

pagesResource.command('get').description('Get one profile page and its blocks')
  .argument('<page-id>', 'Page id or slug').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli pages get PAGE_ID --json')
  .action((pageId: string, opts: DataOptions) => run(async () => link.get(`/v1/link/pages/${await pageRef(pageId)}`), opts))

pagesResource.command('create').description('Create a Link profile page')
  .requiredOption('--slug <slug>', 'Public page slug')
  .requiredOption('--title <title>', 'Page title')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli pages create --slug mon-profil --title "Mon profil" --json')
  .action((opts: DataOptions & { slug: string; title: string }) =>
    run(() => link.post('/v1/link/pages', { slug: opts.slug, title: opts.title }), opts))

pagesResource.command('update').description('Update title, bio, locale, or theme with a JSON body')
  .argument('<page-id>', 'Page id or slug').option('--data <json>', 'JSON body').option('--file <path>', 'JSON file')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli pages update PAGE_ID --data \'{"bio":"Bonjour"}\' --json')
  .action((pageId: string, opts: DataOptions) =>
    run(async () => link.patch(`/v1/link/pages/${await pageRef(pageId)}`, parseBody(opts)), opts))

pagesResource.command('publish').description('Publish the current page draft')
  .argument('<page-id>', 'Page id or slug').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli pages publish PAGE_ID --json')
  .action((pageId: string, opts: DataOptions) =>
    run(async () => link.post(`/v1/link/pages/${await pageRef(pageId)}/publish`), opts))

pagesResource.command('stats').description('Read measured views and clicks')
  .argument('<page-id>', 'Page id or slug').option('--days <n>', 'Number of days')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli pages stats PAGE_ID --days 30 --json')
  .action((pageId: string, opts: DataOptions & { days?: string }) =>
    run(async () => link.get(`/v1/link/pages/${await pageRef(pageId)}/stats`, { days: opts.days }), opts))
