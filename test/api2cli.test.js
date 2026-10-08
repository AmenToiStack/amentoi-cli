import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'
import { test } from 'node:test'

const cli = join(import.meta.dirname, '..', 'dist', 'index.js')
const key = `amen_sk_test_${'a'.repeat(12)}_${'b'.repeat(32)}`

async function server(handler) {
  const instance = createServer(handler)
  instance.listen(0, '127.0.0.1')
  await once(instance, 'listening')
  return { instance, url: `http://127.0.0.1:${instance.address().port}` }
}

async function run(args, env) {
  const child = spawn('bun', [cli, ...args], { env: { ...process.env, ...env } })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const [code] = await once(child, 'close')
  return { code, stdout, stderr }
}

test('api2cli command exchanges shared key and returns a single JSON envelope', async () => {
  const requests = []
  const core = await server((request, response) => {
    requests.push({ service: 'core', path: request.url, key: request.headers['x-api-key'] })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: { token: 'short-link-token' }, meta: {} }))
  })
  const link = await server((request, response) => {
    requests.push({ service: 'link', path: request.url, bearer: request.headers.authorization, key: request.headers['x-api-key'] })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: [{ id: 'page-1' }], meta: { measured: true } }))
  })
  try {
    const result = await run(['pages', 'list', '--json'], {
      AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url, AMENTOI_LINK_URL: link.url,
    })
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, data: [{ id: 'page-1' }], meta: { measured: true } })
    assert.deepEqual(requests, [
      { service: 'core', path: '/v1/products/link/key-session', key },
      { service: 'link', path: '/v1/link/pages', bearer: 'Bearer short-link-token', key: undefined },
    ])
  } finally {
    core.instance.close()
    link.instance.close()
  }
})

test('API denial produces JSON error and nonzero exit', async () => {
  const core = await server((_request, response) => {
    response.writeHead(403, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { code: 'SCOPE_DENIED', message: 'scope denied' } }))
  })
  try {
    const result = await run(['pages', 'list', '--json'], { AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url })
    assert.equal(result.code, 1)
    assert.equal(JSON.parse(result.stderr).error.code, 403)
    assert.doesNotMatch(result.stderr, /amen_sk_test/)
  } finally {
    core.instance.close()
  }
})

test('one account key selects two workspaces and three product services', async () => {
  const requests = []
  const core = await server((request, response) => {
    requests.push({ service: 'core', path: request.url, key: request.headers['x-api-key'], workspace: request.headers['x-amen-workspace-id'] })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: { token: `token-${request.headers['x-amen-workspace-id']}` }, meta: {} }))
  })
  const product = await server((request, response) => {
    requests.push({ service: 'product', path: request.url, bearer: request.headers.authorization, key: request.headers['x-api-key'] })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: [], meta: {} }))
  })
  try {
    const env = { AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url,
      AMENTOI_LINK_URL: product.url, AMENTOI_FORMS_URL: product.url, AMENTOI_PEOPLE_URL: product.url }
    for (const [workspace, args] of [
      ['personal-id', ['pages', 'list']],
      ['organization-id', ['forms', 'list']],
      ['organization-id', ['people', 'list']],
    ]) {
      const result = await run(['--workspace', workspace, ...args, '--json'], env)
      assert.equal(result.code, 0, result.stderr)
    }
    assert.deepEqual(requests, [
      { service: 'core', path: '/v1/products/link/key-session', key, workspace: 'personal-id' },
      { service: 'product', path: '/v1/link/pages', bearer: 'Bearer token-personal-id', key: undefined },
      { service: 'core', path: '/v1/products/forms/key-session', key, workspace: 'organization-id' },
      { service: 'product', path: '/v1/forms', bearer: 'Bearer token-organization-id', key: undefined },
      { service: 'core', path: '/v1/products/people/key-session', key, workspace: 'organization-id' },
      { service: 'product', path: '/v1/people', bearer: 'Bearer token-organization-id', key: undefined },
    ])
  } finally {
    core.instance.close()
    product.instance.close()
  }
})
async function tokenServer() {
  return server((request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: { token: 'short-product-token' } }))
  })
}

test('blocks subtitle keeps the rest of the config and drops the read-only fields', async () => {
  const requests = []
  const core = await tokenServer()
  const link = await server(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push({ method: request.method, path: request.url, body: body === '' ? null : JSON.parse(body) })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(request.method === 'GET'
      ? { data: { id: 'page-1', blocks: [{ id: 'block-1', type: 'FORM', config: { label: 'Inscription', url: 'https://forms.example/f/1', highlight: true, formStatus: 'OPEN' } }] } }
      : { data: { id: 'block-1' } }))
  })
  try {
    const env = { AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url, AMENTOI_LINK_URL: link.url }
    const set = await run(['blocks', 'subtitle', 'page-1', 'block-1', '  Jusqu au 12 octobre  ', '--json'], env)
    assert.equal(set.code, 0, set.stderr)
    const cleared = await run(['blocks', 'subtitle', 'page-1', 'block-1', '--clear', '--json'], env)
    assert.equal(cleared.code, 0, cleared.stderr)
    const patches = requests.filter((entry) => entry.method === 'PATCH')
    assert.deepEqual(patches.map((entry) => entry.path), ['/v1/link/pages/page-1/blocks/block-1', '/v1/link/pages/page-1/blocks/block-1'])
    assert.deepEqual(patches[0].body, { config: { label: 'Inscription', url: 'https://forms.example/f/1', highlight: true, subtitle: 'Jusqu au 12 octobre' } })
    assert.equal(patches[1].body.config.subtitle, null)

    const neither = await run(['blocks', 'subtitle', 'page-1', 'block-1', '--json'], env)
    assert.notEqual(neither.code, 0)
    const missing = await run(['blocks', 'subtitle', 'page-1', 'block-9', 'x', '--json'], env)
    assert.notEqual(missing.code, 0)
    assert.equal(requests.filter((entry) => entry.method === 'PATCH').length, 2)
  } finally {
    core.instance.close()
    link.instance.close()
  }
})

test('blocks create --subtitle merges it into the config', async () => {
  const bodies = []
  const core = await tokenServer()
  const link = await server(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    bodies.push(JSON.parse(body))
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: { id: 'block-1' } }))
  })
  try {
    const result = await run(['blocks', 'create', 'page-1', '--type', 'LINK', '--data', '{"label":"Podcast","url":"https://example.com"}', '--subtitle', '45 min', '--json'], {
      AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url, AMENTOI_LINK_URL: link.url,
    })
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(bodies, [{ type: 'LINK', config: { label: 'Podcast', url: 'https://example.com', subtitle: '45 min' } }])
  } finally {
    core.instance.close()
    link.instance.close()
  }
})
