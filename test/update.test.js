import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

const cli = join(import.meta.dirname, '..', 'dist', 'index.js')
const current = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')).version

async function run(args, env) {
  const base = { ...process.env }
  for (const name of ['AMENTOI_NO_UPDATE_CHECK', 'CI', 'AMENTOI_UPDATE_URL']) delete base[name]
  const child = spawn('bun', [cli, ...args], { env: { ...base, ...env } })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const [code] = await once(child, 'close')
  return { code, stdout, stderr }
}

async function releases(tag) {
  const instance = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ tag_name: tag }))
  })
  instance.listen(0, '127.0.0.1')
  await once(instance, 'listening')
  return { instance, url: `http://127.0.0.1:${instance.address().port}/latest` }
}

test('package.json and the CLI report the same version', async () => {
  const home = mkdtempSync(join(tmpdir(), 'amentoi-update-'))
  const result = await run(['--version'], { HOME: home, AMENTOI_NO_UPDATE_CHECK: '1' })
  assert.equal(result.stdout.trim(), current)
})

test('version --json says whether to update and how', async () => {
  const home = mkdtempSync(join(tmpdir(), 'amentoi-update-'))
  const newer = await releases('v99.0.0')
  const same = await releases(`v${current}`)
  try {
    const outdated = await run(['version', '--json'], { HOME: home, AMENTOI_UPDATE_URL: newer.url })
    assert.equal(outdated.code, 0, outdated.stderr)
    const data = JSON.parse(outdated.stdout).data
    assert.equal(data.current, current)
    assert.equal(data.latest, '99.0.0')
    assert.equal(data.updateAvailable, true)
    assert.match(data.command, /amentoi-cli/)

    const upToDate = await run(['version', '--json'], { HOME: home, AMENTOI_UPDATE_URL: same.url })
    assert.equal(JSON.parse(upToDate.stdout).data.updateAvailable, false)
    assert.equal(JSON.parse(upToDate.stdout).data.command, null)
  } finally { newer.instance.close(); same.instance.close() }
})

test('a known newer release is announced on stderr, never on stdout, and can be turned off', async () => {
  const home = mkdtempSync(join(tmpdir(), 'amentoi-update-'))
  mkdirSync(join(home, '.config', 'amentoi'), { recursive: true })
  writeFileSync(join(home, '.config', 'amentoi', 'update-check.json'), JSON.stringify({ latest: '99.0.0', checkedAt: new Date().toISOString() }))
  const announced = await run(['workspaces', '--help'], { HOME: home })
  assert.match(announced.stderr, /amentoi-cli 99\.0\.0 is available/)
  assert.doesNotMatch(announced.stdout, /is available/)
  const quiet = await run(['workspaces', '--help'], { HOME: home, AMENTOI_NO_UPDATE_CHECK: '1' })
  assert.doesNotMatch(quiet.stderr, /is available/)
})
