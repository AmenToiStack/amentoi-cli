import { clientFor } from './client.js'
import { id } from './cli.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The Link API addresses a page by its uuid only. A creator knows the slug, so a value that
 * is not a uuid is looked up among the workspace's pages and replaced by its id. Returns the
 * id already URL-encoded for a path segment.
 */
export async function pageRef(value: string): Promise<string> {
  if (UUID.test(value)) return id(value)
  const slug = value.trim().replace(/^@/, '').toLowerCase()
  const listed = await clientFor('link').get('/v1/link/pages') as { data?: { id: string; slug: string }[] }
  const page = (listed.data ?? []).find((candidate) => candidate.slug.toLowerCase() === slug)
  if (!page) throw new Error(`No page with slug "${value}" in this workspace (see: amentoi-cli pages list)`)
  return id(page.id)
}
