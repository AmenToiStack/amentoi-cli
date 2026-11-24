import { Command } from 'commander'
import { clientFor, requestBytes, uploadBytes } from '../lib/client.js'
import { id, parseBody, run, type DataOptions } from '../lib/cli.js'
import { pageRef } from '../lib/pages.js'

const link = clientFor('link')
export const blocksResource = new Command('blocks').description('Manage Link page blocks')

blocksResource.command('create').description('Create a link or form block')
  .argument('<page-id>', 'Page id or slug').requiredOption('--type <type>', 'LINK or FORM')
  .option('--data <json>', 'Block config JSON').option('--file <path>', 'Block config JSON file')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks create PAGE_ID --type LINK --data \'{"url":"https://example.com","label":"Site"}\' --json')
  .action((pageId: string, opts: DataOptions & { type: string }) =>
    run(async () => link.post(`/v1/link/pages/${await pageRef(pageId)}/blocks`, { type: opts.type, config: parseBody(opts) }), opts))

blocksResource.command('update').description('Replace a block config')
  .argument('<page-id>', 'Page id or slug').argument('<block-id>')
  .option('--data <json>', 'Block config JSON').option('--file <path>', 'Block config JSON file')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks update PAGE_ID BLOCK_ID --file block.json --json')
  .action((pageId: string, blockId: string, opts: DataOptions) =>
    run(async () => link.patch(`/v1/link/pages/${await pageRef(pageId)}/blocks/${id(blockId)}`, { config: parseBody(opts) }), opts))

blocksResource.command('delete').description('Delete a block')
  .argument('<page-id>', 'Page id or slug').argument('<block-id>').option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks delete PAGE_ID BLOCK_ID --json')
  .action((pageId: string, blockId: string, opts: DataOptions) =>
    run(async () => link.delete(`/v1/link/pages/${await pageRef(pageId)}/blocks/${id(blockId)}`), opts))

blocksResource.command('window').description('Schedule a link block visibility window')
  .argument('<page-id>', 'Page id or slug').argument('<block-id>')
  .requiredOption('--from <iso-or-null>', 'Start ISO date or null')
  .requiredOption('--until <iso-or-null>', 'End ISO date or null')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks window PAGE_ID BLOCK_ID --from 2026-10-01T09:00:00Z --until null --json')
  .action((pageId: string, blockId: string, opts: DataOptions & { from: string; until: string }) =>
    run(async () => link.patch(`/v1/link/pages/${await pageRef(pageId)}/blocks/${id(blockId)}/visibility-window`, {
      visibleFrom: opts.from === 'null' ? null : opts.from,
      visibleUntil: opts.until === 'null' ? null : opts.until,
    }), opts))

blocksResource.command('image').description('Preview a remote image for a page and save it locally')
  .argument('<page-id>', 'Page id or slug').requiredOption('--url <url>', 'Image source URL')
  .requiredOption('--output <path>', 'Local image output path')
  .option('--kind <kind>', 'auto, icon, or image', 'auto')
  .option('--json', 'Output as JSON')
  .addHelpText('after', '\nExample: amentoi-cli blocks image PAGE_ID --url https://example.com --output preview.webp --json')
  .action((pageId: string, opts: DataOptions & { url: string; output: string; kind: string }) =>
    run(async () => {
      const image = await requestBytes('link', 'POST', `/v1/link/pages/${await pageRef(pageId)}/thumbnails/preview`, { url: opts.url, kind: opts.kind })
      await Bun.write(opts.output, image.bytes)
      return { data: { output: opts.output, contentType: image.contentType, bytes: image.bytes.length }, meta: {} }
    }, opts))

blocksResource.command('thumbnail').description('Upload an image and attach it to a link or form block')
  .argument('<page-id>', 'Page id or slug').argument('<block-id>')
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
      const pageKey = await pageRef(pageId)
      const page = await link.get(`/v1/link/pages/${pageKey}`) as { data?: { blocks?: { id: string; type: string; config: Record<string, unknown> }[] } }
      const block = page.data?.blocks?.find((item) => item.id === blockId)
      if (!block || !['LINK', 'FORM'].includes(block.type)) throw new Error('Block not found or cannot have a thumbnail')
      const uploaded = await uploadBytes('link', `/v1/link/pages/${pageKey}/thumbnails`, bytes, type) as { data?: { assetId?: string } }
      if (!uploaded.data?.assetId) throw new Error('Thumbnail upload returned no asset ID')
      await link.patch(`/v1/link/pages/${pageKey}/blocks/${id(blockId)}`, {
        config: { ...block.config, thumbnail: { kind: 'asset', assetId: uploaded.data.assetId } },
      })
      return { data: { pageId, blockId, assetId: uploaded.data.assetId }, meta: {} }
    }, opts))
