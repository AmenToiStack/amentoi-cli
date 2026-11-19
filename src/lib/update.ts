import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/** The single place the CLI's version is written; `package.json` is bumped with it. */
export const VERSION = '0.5.1'

const REPO = 'AmenToiStack/amentoi-cli'
const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_PATH = join(homedir(), '.config', 'amentoi', 'update-check.json')

export interface UpdateStatus {
  current: string
  latest: string | null
  updateAvailable: boolean
  checkedAt: string | null
  /** How to update this install; null when already up to date or the latest version is unknown. */
  command: string | null
  releaseUrl: string | null
}

interface Cache { latest: string; checkedAt: string }

/** `0.10.0` > `0.9.3`; a pre-release or malformed tag is never "newer". */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())?.slice(1).map(Number)
  const a = parse(candidate)
  const b = parse(current)
  if (!a || !b) return false
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  }
  return false
}

export function updateCommand(latest: string, scriptPath = process.argv[1] ?? ''): string {
  const tag = latest.replace(/^v/, '')
  // api2cli installs live in ~/.cli/amentoi-cli and are linked from ~/.local/bin.
  if (scriptPath.includes(`${join('.cli', 'amentoi-cli')}`) || scriptPath.includes(join('.local', 'bin'))) {
    return `api2cli install ${REPO} --force`
  }
  return `npm install -g https://github.com/${REPO}/releases/download/v${tag}/amentoi-cli-${tag}.tgz`
}

function disabled(): boolean {
  return process.env.AMENTOI_NO_UPDATE_CHECK === '1' || process.env.CI === 'true'
}

function readCache(): Cache | null {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Partial<Cache>
    return typeof parsed.latest === 'string' && typeof parsed.checkedAt === 'string' ? { latest: parsed.latest, checkedAt: parsed.checkedAt } : null
  } catch { return null }
}

function writeCache(cache: Cache): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true, mode: 0o700 })
    writeFileSync(CACHE_PATH, JSON.stringify(cache) + '\n', { mode: 0o600 })
  } catch { /* a read-only home only loses the cache */ }
}

/** The latest release tag on GitHub, or null when it cannot be read within the timeout. */
async function fetchLatest(timeoutMs: number): Promise<string | null> {
  const url = process.env.AMENTOI_UPDATE_URL ?? `https://api.github.com/repos/${REPO}/releases/latest`
  try {
    const response = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'amentoi-cli' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
    if (!response.ok) return null
    const body = await response.json() as { tag_name?: unknown }
    return typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : null
  } catch { return null }
}

function status(latest: string | null, checkedAt: string | null): UpdateStatus {
  const updateAvailable = latest !== null && isNewer(latest, VERSION)
  return {
    current: VERSION,
    latest,
    updateAvailable,
    checkedAt,
    command: updateAvailable && latest ? updateCommand(latest) : null,
    releaseUrl: latest ? `https://github.com/${REPO}/releases/tag/v${latest}` : null,
  }
}

/** `amentoi-cli version`: always asks GitHub, falls back to the cached answer. */
export async function checkNow(): Promise<UpdateStatus> {
  const latest = await fetchLatest(5000)
  if (latest !== null) {
    const checkedAt = new Date().toISOString()
    writeCache({ latest, checkedAt })
    return status(latest, checkedAt)
  }
  const cache = readCache()
  return status(cache?.latest ?? null, cache?.checkedAt ?? null)
}

/**
 * The passive notice: once a day at most, a background request refreshes the cache, and when a
 * newer release is known one line goes to STDERR as the process exits, so `--json` on stdout
 * stays a clean envelope. `AMENTOI_NO_UPDATE_CHECK=1` (or `CI=true`) turns it off.
 */
export function startPassiveCheck(): void {
  if (disabled()) return
  let cache = readCache()
  const stale = cache === null || Date.now() - Date.parse(cache.checkedAt) > DAY_MS
  if (stale) {
    void fetchLatest(1500).then((latest) => {
      if (latest === null) return
      cache = { latest, checkedAt: new Date().toISOString() }
      writeCache(cache)
    })
  }
  process.on('exit', () => {
    if (!cache || !isNewer(cache.latest, VERSION)) return
    process.stderr.write(`amentoi-cli ${cache.latest} is available (you have ${VERSION}). Update: ${updateCommand(cache.latest)}\n`)
  })
}
