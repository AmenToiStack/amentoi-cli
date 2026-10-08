import { Command } from 'commander'
import { clientFor, requestBytes, uploadBytes } from '../lib/client.js'
import { id, parseBody, run, type DataOptions } from '../lib/cli.js'

const link = clientFor('link')
export const blocksResource = new Command('blocks').description('Manage Link page blocks')

type SubtitleOptions = { subtitle?: string }

/** The smaller line under a button's label. Link refuses an empty one: blank means none (null). */
function subtitleValue(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.length > 80) throw new Error('A subtitle is at most 80 characters')
  return trimmed === '' ? null : trimmed
}

function withSubtitle(config: Record<string, unknown>, opts: SubtitleOptions): Record<string, unknown> {
  return opts.subtitle === undefined ? config : { ...config, subtitle: subtitleValue(opts.subtitle) }
}

blocksResource.command('create').description('Create a link or form block')
  .argument('<page-id>').requiredOption('--type <type>', 'LINK or FORM')
  .option('--data <json>', 'Block config JSON').option('--file <path>', 'Block config JSON file')
  .option('--subtitle <text>', 'Smaller line under the label (at most 80 characters)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks create PAGE_ID --type LINK --data \'{"url":"https://example.com","label":"Site"}\' --subtitle "45 min" --json')
  .action((pageId: string, opts: DataOptions & SubtitleOptions & { type: string }) =>
    run(() => link.post(`/v1/link/pages/${id(pageId)}/blocks`, { type: opts.type, config: withSubtitle(parseBody(opts), opts) }), opts))

blocksResource.command('update').description('Replace a block config')
  .argument('<page-id>').argument('<block-id>')
  .option('--data <json>', 'Block config JSON').option('--file <path>', 'Block config JSON file')
  .option('--subtitle <text>', 'Smaller line under the label; "" removes it')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks update PAGE_ID BLOCK_ID --file block.json --json')
  .action((pageId: string, blockId: string, opts: DataOptions & SubtitleOptions) =>
    run(() => link.patch(`/v1/link/pages/${id(pageId)}/blocks/${id(blockId)}`, { config: withSubtitle(parseBody(opts), opts) }), opts))

interface PageBlock { readonly id: string; readonly type: string; readonly config: Record<string, unknown> }

blocksResource.command('subtitle').description('Set or remove the subtitle of a link or form block, keeping the rest of its config')
  .argument('<page-id>').argument('<block-id>').argument('[text]', 'The subtitle, at most 80 characters')
  .option('--clear', 'Remove the subtitle')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExamples:\n  amentoi-cli blocks subtitle PAGE_ID BLOCK_ID "45 min" --json\n  amentoi-cli blocks subtitle PAGE_ID BLOCK_ID --clear --json')
  .action((pageId: string, blockId: string, text: string | undefined, opts: DataOptions & { clear?: boolean }) =>
    run(async () => {
      if ((text === undefined) === (opts.clear !== true)) throw new Error('Give the subtitle text, or --clear')
      const subtitle = opts.clear === true ? null : subtitleValue(text ?? '')
      if (subtitle === null && opts.clear !== true) throw new Error('The subtitle is empty; use --clear to remove it')
      // PATCH replaces the whole config, so the block's current one is read first.
      const page = await link.get(`/v1/link/pages/${id(pageId)}`) as { data?: { blocks?: readonly PageBlock[] } }
      const block = page.data?.blocks?.find((candidate) => candidate.id === blockId)
      if (block === undefined) throw new Error(`Block ${blockId} is not on page ${pageId}`)
      if (block.type !== 'LINK' && block.type !== 'FORM') throw new Error(`A ${block.type} block has no subtitle; only LINK and FORM do`)
      // `formStatus` and `productStatus` are added by the read for display; they are not config.
      const { formStatus: _form, productStatus: _product, ...config } = block.config
      return link.patch(`/v1/link/pages/${id(pageId)}/blocks/${id(blockId)}`, { config: { ...config, subtitle } })
    }, opts))

blocksResource.command('delete').description('Delete a block')
  .argument('<page-id>').argument('<block-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks delete PAGE_ID BLOCK_ID --json')
  .action((pageId: string, blockId: string, opts: DataOptions) =>
    run(() => link.delete(`/v1/link/pages/${id(pageId)}/blocks/${id(blockId)}`), opts))

blocksResource.command('window').description('Schedule a link block visibility window')
  .argument('<page-id>').argument('<block-id>')
  .requiredOption('--from <iso-or-null>', 'Start ISO date or null')
  .requiredOption('--until <iso-or-null>', 'End ISO date or null')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks window PAGE_ID BLOCK_ID --from 2026-10-01T09:00:00Z --until null --json')
  .action((pageId: string, blockId: string, opts: DataOptions & { from: string; until: string }) =>
    run(() => link.patch(`/v1/link/pages/${id(pageId)}/blocks/${id(blockId)}/visibility-window`, {
      visibleFrom: opts.from === 'null' ? null : opts.from,
      visibleUntil: opts.until === 'null' ? null : opts.until,
    }), opts))

blocksResource.command('image').description('Preview a remote image for a page and save it locally')
  .argument('<page-id>').requiredOption('--url <url>', 'Image source URL')
  .requiredOption('--output <path>', 'Local image output path')
  .option('--kind <kind>', 'auto, icon, or image', 'auto')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks image PAGE_ID --url https://example.com --output preview.webp --json')
  .action((pageId: string, opts: DataOptions & { url: string; output: string; kind: string }) =>
    run(async () => {
      const image = await requestBytes('link', 'POST', `/v1/link/pages/${id(pageId)}/thumbnails/preview`, { url: opts.url, kind: opts.kind })
      await Bun.write(opts.output, image.bytes)
      return { data: { output: opts.output, contentType: image.contentType, bytes: image.bytes.length }, meta: {} }
    }, opts))

blocksResource.command('thumbnail').description('Upload an image and attach it to a link or form block')
  .argument('<page-id>').argument('<block-id>')
  .requiredOption('--file <path>', 'PNG, JPEG, or WebP image file')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks thumbnail PAGE_ID BLOCK_ID --file preview.webp --json')
  .action((pageId: string, blockId: string, opts: DataOptions & { file: string }) =>
    run(async () => {
      const bytes = new Uint8Array(await Bun.file(opts.file).arrayBuffer())
      const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png'
        : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
          : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 ? 'image/webp' : null
      if (!type) throw new Error('Thumbnail must be PNG, JPEG, or WebP')
      const page = await link.get(`/v1/link/pages/${id(pageId)}`) as { data?: { blocks?: { id: string; type: string; config: Record<string, unknown> }[] } }
      const block = page.data?.blocks?.find((item) => item.id === blockId)
      if (!block || !['LINK', 'FORM'].includes(block.type)) throw new Error('Block not found or cannot have a thumbnail')
      const uploaded = await uploadBytes('link', `/v1/link/pages/${id(pageId)}/thumbnails`, bytes, type) as { data?: { assetId?: string } }
      if (!uploaded.data?.assetId) throw new Error('Thumbnail upload returned no asset ID')
      await link.patch(`/v1/link/pages/${id(pageId)}/blocks/${id(blockId)}`, {
        config: { ...block.config, thumbnail: { kind: 'asset', assetId: uploaded.data.assetId } },
      })
      return { data: { pageId, blockId, assetId: uploaded.data.assetId }, meta: {} }
    }, opts))
