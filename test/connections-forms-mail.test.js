import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

const cli = join(import.meta.dirname, '..', 'dist', 'index.js')
const key = `amen_sk_test_${'a'.repeat(12)}_${'b'.repeat(32)}`
const WS = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CONNECTION = '33333333-3333-4333-8333-333333333333'

async function server(handler) {
  const instance = createServer(handler)
  instance.listen(0, '127.0.0.1')
  await once(instance, 'listening')
  return { instance, url: `http://127.0.0.1:${instance.address().port}` }
}

async function run(args, env) {
  const base = { ...process.env, AMENTOI_CONFIG: join(tmpdir(), 'amentoi-test-missing', 'cli.json') }
  for (const name of ['AMENTOI_USER_TOKEN', 'AMENTOI_MAIL_URL', 'AMENTOI_WORKSPACE_ID']) delete base[name]
  const child = spawn('bun', [cli, ...args], { env: { ...base, ...env } })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const [code] = await once(child, 'close')
  return { code, stdout, stderr }
}

/** A Core that mints a session for any product, and one product API that answers per route. */
async function stack(answer) {
  const requests = []
  const body = (request) => new Promise((resolve) => {
    let raw = ''
    request.on('data', (chunk) => { raw += chunk })
    request.on('end', () => resolve(raw === '' ? undefined : JSON.parse(raw)))
  })
  const core = await server(async (request, response) => {
    const parsed = await body(request)
    response.setHeader('content-type', 'application/json')
    if (request.url.includes('/key-session')) {
      requests.push({ on: 'core', method: request.method, path: request.url, key: request.headers['x-api-key'] })
      response.end(JSON.stringify({ data: { token: 'short-token' }, meta: {} }))
      return
    }
    requests.push({
      on: 'core', method: request.method, path: request.url, body: parsed,
      bearer: request.headers.authorization, key: request.headers['x-api-key'],
    })
    response.statusCode = request.method === 'POST' && request.url === '/v1/connections' ? 201 : 200
    response.end(JSON.stringify({ data: { ok: true }, meta: {} }))
  })
  const product = await server(async (request, response) => {
    const parsed = await body(request)
    requests.push({ on: 'product', method: request.method, path: request.url, body: parsed, bearer: request.headers.authorization })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(answer?.(request, parsed) ?? { data: [], meta: {} }))
  })
  const env = {
    AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url, AMENTOI_FORMS_URL: product.url,
    AMENTOI_PEOPLE_URL: product.url, AMENTOI_MAIL_URL: product.url,
  }
  return {
    requests, env,
    close: () => { core.instance.close(); product.instance.close() },
    productRequests: () => requests.filter((item) => item.on === 'product'),
  }
}

test('connections work with a user session, never send the API key, and default to the selected workspace', async () => {
  const s = await stack()
  try {
    const env = { ...s.env, AMENTOI_USER_TOKEN: 'user-jwt' }
    const list = await run(['--workspace', WS, 'connections', 'list', '--json'], env)
    assert.equal(list.code, 0, list.stderr)
    assert.deepEqual(JSON.parse(list.stdout), { ok: true, data: { ok: true }, meta: {} })

    const people = await run(['--workspace', WS, 'connections', 'connect', 'people', 'mail', '--json'], env)
    assert.equal(people.code, 0, people.stderr)

    const forms = await run(['connections', 'connect', 'forms', 'people', '--source-workspace', WS, '--consumer-workspace', OTHER, '--json'], env)
    assert.equal(forms.code, 0, forms.stderr)

    assert.equal((await run(['connections', 'disconnect', CONNECTION, '--json'], env)).code, 0)
    assert.equal((await run(['connections', 'resync', CONNECTION, '--json'], env)).code, 0)

    assert.deepEqual(s.requests, [
      { on: 'core', method: 'GET', path: `/v1/workspaces/${WS}/connections`, body: undefined, bearer: 'Bearer user-jwt', key: undefined },
      { on: 'core', method: 'POST', path: '/v1/connections', bearer: 'Bearer user-jwt', key: undefined,
        body: { sourceProductKey: 'people', sourceWorkspaceId: WS, consumerProductKey: 'mail', consumerWorkspaceId: WS } },
      { on: 'core', method: 'POST', path: '/v1/connections', bearer: 'Bearer user-jwt', key: undefined,
        body: { sourceProductKey: 'forms', sourceWorkspaceId: WS, consumerProductKey: 'people', consumerWorkspaceId: OTHER } },
      { on: 'core', method: 'DELETE', path: `/v1/connections/${CONNECTION}`, body: undefined, bearer: 'Bearer user-jwt', key: undefined },
      { on: 'core', method: 'POST', path: `/v1/connections/${CONNECTION}/resync`, body: undefined, bearer: 'Bearer user-jwt', key: undefined },
    ])
  } finally { s.close() }
})

test('connections refuse locally without a user session and make no request', async () => {
  const s = await stack()
  try {
    const result = await run(['--workspace', WS, 'connections', 'list', '--json'], s.env)
    assert.equal(result.code, 1)
    const error = JSON.parse(result.stderr).error
    assert.equal(error.code, 401)
    assert.match(error.message, /signed-in user session/)
    assert.match(error.suggestion, /AMENTOI_USER_TOKEN/)
    assert.deepEqual(s.requests, [])
    assert.doesNotMatch(result.stderr, /amen_sk_test/)

    const noWorkspace = await run(['connections', 'connect', 'people', 'mail', '--json'], { ...s.env, AMENTOI_USER_TOKEN: 'user-jwt' })
    assert.equal(noWorkspace.code, 1)
    assert.match(JSON.parse(noWorkspace.stderr).error.message, /workspace/)
    assert.deepEqual(s.requests, [])
  } finally { s.close() }
})

test('connections surface a Core refusal as a nonzero JSON error', async () => {
  const core = await server((_request, response) => {
    response.writeHead(403, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'forbidden' } }))
  })
  try {
    const result = await run(['connections', 'disconnect', CONNECTION, '--json'], { AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url, AMENTOI_USER_TOKEN: 'user-jwt' })
    assert.equal(result.code, 1)
    assert.equal(JSON.parse(result.stderr).error.code, 403)
  } finally { core.instance.close() }
})

test('people mail-status and mail-resync go through the People key session', async () => {
  const s = await stack((request) => request.url.endsWith('/connections')
    ? { mail: { state: 'ACTIVE', lastSyncAt: null, lastSyncCount: 0, pending: 0 }, forms: { state: 'NO_RECEIPTS' } }
    : { queued: 42 })
  try {
    const status = await run(['people', 'mail-status', '--json'], s.env)
    assert.equal(status.code, 0, status.stderr)
    assert.equal(JSON.parse(status.stdout).data.mail.state, 'ACTIVE')
    const resync = await run(['people', 'mail-resync', '--json'], s.env)
    assert.equal(resync.code, 0, resync.stderr)
    assert.deepEqual(JSON.parse(resync.stdout), { ok: true, data: { queued: 42 }, meta: {} })
    assert.deepEqual(s.requests.filter((item) => item.on === 'core').map((item) => item.path),
      ['/v1/products/people/key-session', '/v1/products/people/key-session'])
    assert.deepEqual(s.productRequests().map((item) => [item.method, item.path, item.bearer]), [
      ['GET', '/v1/integrations/connections', 'Bearer short-token'],
      ['POST', '/v1/integrations/mail/resync', 'Bearer short-token'],
    ])
  } finally { s.close() }
})

const formWire = (settings) => ({
  data: { id: 'form-1', name: 'Inscription', slug: 'inscription', settings }, meta: {},
})
const fullSettings = {
  opensAt: null, closesAt: null, responseQuota: 50, hourlyAbuseBudget: 1000, retentionDays: 365,
  successMessage: 'Merci', closedMessage: 'Ferme', redirectUrl: null,
  people: { sendToPeople: true, respondentTags: ['membre'] },
}

test('forms get shows the People settings, with defaults when absent', async () => {
  let settings = fullSettings
  const s = await stack(() => formWire(settings))
  try {
    const first = await run(['forms', 'get', 'form-1', '--json'], s.env)
    assert.equal(first.code, 0, first.stderr)
    assert.deepEqual(JSON.parse(first.stdout).data.people, { sendToPeople: true, respondentTags: ['membre'] })
    settings = { ...fullSettings, people: { sendToPeople: false, respondentTags: [] } }
    const second = await run(['forms', 'get', 'form-1', '--json'], s.env)
    assert.deepEqual(JSON.parse(second.stdout).data.people, { sendToPeople: false, respondentTags: [] })
    settings = undefined
    const third = await run(['forms', 'get', 'form-1', '--json'], s.env)
    assert.deepEqual(JSON.parse(third.stdout).data.people, { sendToPeople: true, respondentTags: [] })
  } finally { s.close() }
})

test('forms create writes settings.people from the flags', async () => {
  const s = await stack(() => formWire(fullSettings))
  try {
    const schema = { title: 'T', fields: [] }
    const result = await run(['forms', 'create', '--data', JSON.stringify({ name: 'Inscription', slug: 'inscription', schema }),
      '--no-send-to-people', '--respondent-tags', ' membre, Benevole ,', '--json'], s.env)
    assert.equal(result.code, 0, result.stderr)
    const [request] = s.productRequests()
    assert.equal(request.method, 'POST')
    assert.equal(request.path, '/v1/forms')
    assert.deepEqual(request.body, {
      name: 'Inscription', slug: 'inscription', schema,
      settings: { people: { sendToPeople: false, respondentTags: ['membre', 'Benevole'] } },
    })

    s.requests.length = 0
    await run(['forms', 'create', '--data', JSON.stringify({ name: 'N', slug: 'n', schema }), '--json'], s.env)
    assert.equal('settings' in s.productRequests()[0].body, false)
  } finally { s.close() }
})

test('forms update merges the People flags onto the current settings', async () => {
  const s = await stack(() => formWire(fullSettings))
  try {
    const tags = await run(['forms', 'update', 'form-1', '--respondent-tags', 'a,b', '--json'], s.env)
    assert.equal(tags.code, 0, tags.stderr)
    const off = await run(['forms', 'update', 'form-1', '--no-send-to-people', '--json'], s.env)
    assert.equal(off.code, 0, off.stderr)
    const clear = await run(['forms', 'update', 'form-1', '--send-to-people', '--respondent-tags', '', '--json'], s.env)
    assert.equal(clear.code, 0, clear.stderr)
    assert.deepEqual(s.productRequests().map((item) => [item.method, item.path, item.body?.settings?.people]), [
      ['GET', '/v1/forms/form-1', undefined],
      ['PATCH', '/v1/forms/form-1', { sendToPeople: true, respondentTags: ['a', 'b'] }],
      ['GET', '/v1/forms/form-1', undefined],
      ['PATCH', '/v1/forms/form-1', { sendToPeople: false, respondentTags: ['membre'] }],
      ['GET', '/v1/forms/form-1', undefined],
      ['PATCH', '/v1/forms/form-1', { sendToPeople: true, respondentTags: [] }],
    ])
    const patch = s.productRequests().find((item) => item.method === 'PATCH')
    assert.equal(patch.body.settings.retentionDays, 365)
    assert.equal(patch.body.settings.responseQuota, 50)
  } finally { s.close() }
})

test('forms update keeps the plain JSON path and rejects more than 20 tags', async () => {
  const s = await stack(() => formWire(fullSettings))
  try {
    const plain = await run(['forms', 'update', 'form-1', '--data', '{"name":"Nouveau"}', '--json'], s.env)
    assert.equal(plain.code, 0, plain.stderr)
    assert.deepEqual(s.productRequests().map((item) => [item.method, item.body]), [['PATCH', { name: 'Nouveau' }]])
    const tooMany = await run(['forms', 'update', 'form-1', '--respondent-tags', Array.from({ length: 21 }, (_, i) => `t${i}`).join(','), '--json'], s.env)
    assert.equal(tooMany.code, 1)
    assert.match(JSON.parse(tooMany.stderr).error.message, /20/)
    const neither = await run(['forms', 'update', 'form-1', '--json'], s.env)
    assert.equal(neither.code, 1)
  } finally { s.close() }
})

test('mail read commands use the mail key session and the exact routes', async () => {
  const s = await stack()
  try {
    const calls = [
      [['mail', 'contacts', 'list', '--tags', 't1,t2', '--tag-mode', 'all', '--origin', 'PEOPLE_SYNC', '--basis', 'CONSENT', '--status', 'subscribed', '--limit', '10'],
        '/v1/contacts'],
      [['mail', 'contacts', 'get', 'c-1'], '/v1/contacts/c-1'],
      [['mail', 'tags', 'list', '--sort', 'name'], '/v1/tags?sort=name'],
      [['mail', 'segments', 'list', '--kind', 'DYNAMIC', '--archived'], '/v1/segments?kind=DYNAMIC&archived=true'],
      [['mail', 'segments', 'get', 's-1'], '/v1/segments/s-1'],
      [['mail', 'campaigns', 'list', '--view', 'sent'], '/v1/campaigns?view=sent'],
      [['mail', 'campaigns', 'get', 'k-1'], '/v1/campaigns/k-1'],
      [['mail', 'campaigns', 'report', 'k-1'], '/v1/campaigns/k-1/analytics'],
      [['mail', 'sources'], '/v1/integrations/people'],
    ]
    for (const [args] of calls) {
      const result = await run([...args, '--json'], s.env)
      assert.equal(result.code, 0, `${args.join(' ')}: ${result.stderr}`)
      assert.deepEqual(JSON.parse(result.stdout), { ok: true, data: [], meta: {} })
    }
    const productPaths = s.productRequests().map((item) => `${item.method} ${item.path}`)
    assert.equal(productPaths.length, calls.length)
    assert.ok(productPaths.every((line) => line.startsWith('GET ')), 'mail commands are read-only')
    const first = new URL(`http://x${s.productRequests()[0].path}`)
    assert.equal(first.pathname, '/v1/contacts')
    assert.deepEqual(Object.fromEntries(first.searchParams), {
      status: 'subscribed', tags: 't1,t2', tagMode: 'all', origin: 'PEOPLE_SYNC', basis: 'CONSENT', limit: '10',
    })
    assert.deepEqual(productPaths.slice(1), calls.slice(1).map(([, path]) => `GET ${path}`))
    assert.ok(s.requests.filter((item) => item.on === 'core').every((item) => item.path === '/v1/products/mail/key-session' && item.key === key))
    assert.ok(s.productRequests().every((item) => item.bearer === 'Bearer short-token'))
  } finally { s.close() }
})

test('mail has no built-in origin and says how to configure it', async () => {
  const s = await stack()
  try {
    const { AMENTOI_MAIL_URL: _unused, ...env } = s.env
    const result = await run(['mail', 'tags', 'list', '--json'], env)
    assert.equal(result.code, 1)
    assert.match(JSON.parse(result.stderr).error.message, /Configure mail: amentoi-cli config set mail/)
    assert.deepEqual(s.productRequests(), [])
  } finally { s.close() }
})

test('Core refusing the mail key session is reported, not hidden', async () => {
  const core = await server((_request, response) => {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not found' } }))
  })
  try {
    const result = await run(['mail', 'tags', 'list', '--json'], { AMENTOI_API_KEY: key, AMENTOI_CORE_URL: core.url, AMENTOI_MAIL_URL: 'http://127.0.0.1:9' })
    assert.equal(result.code, 1)
    assert.equal(JSON.parse(result.stderr).error.code, 404)
  } finally { core.instance.close() }
})

test('help does not offer what API keys are forbidden to do', async () => {
  const mailHelp = await run(['mail', '--help'], {})
  assert.equal(mailHelp.code, 0)
  assert.match(mailHelp.stdout, /mail\.integration\.write is forbidden to API keys/)
  for (const group of ['contacts', 'tags', 'segments', 'campaigns']) {
    const help = await run(['mail', group, '--help'], {})
    assert.doesNotMatch(help.stdout, /^\s+(create|update|delete|send|schedule|merge|import|export|integration|relay)\b/m, `${group} stays read-only`)
  }
  for (const args of [['mail', 'integration'], ['mail', 'relay'], ['mail', 'campaigns', 'send', 'x'], ['people', 'optout'], ['people', 'integration']]) {
    const result = await run(args, {})
    assert.notEqual(result.code, 0, `${args.join(' ')} must not exist`)
    assert.match(result.stderr, /unknown command/)
  }
  const connections = await run(['connections', '--help'], {})
  assert.match(connections.stdout, /signed-in user session/)
  assert.match(connections.stdout, /API keys are refused/)
  const resync = await run(['people', 'mail-resync', '--help'], {})
  assert.match(resync.stdout, /people\.export\.write/)
})
