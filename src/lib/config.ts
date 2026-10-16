import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'

export const APP_CLI = 'amentoi-cli'
export const TOKEN_PATH = join(homedir(), '.config', 'tokens', 'amentoi-cli.txt')
export const LEGACY_CONFIG_PATH = process.env.AMENTOI_CONFIG ?? join(homedir(), '.config', 'amentoi', 'cli.json')
export const SERVICE_NAMES = ['core', 'link', 'forms', 'people', 'mail'] as const
export type Service = string
export const isServiceName = (name: string): boolean => /^[a-z][a-z0-9]{2,23}$/.test(name) && !['identity', 'billing'].includes(name)
const PRODUCTION_URLS: Record<string, string> = {
  core: 'https://api.amentoi.com',
  link: 'https://link-api.amentoi.com',
  forms: 'https://forms-api.amentoi.com',
  people: 'https://people-api.amentoi.com',
}

export const globalFlags = {
  json: false,
  format: 'text' as 'text' | 'json' | 'csv' | 'yaml',
  verbose: false,
  noColor: false,
  noHeader: false,
  workspace: undefined as string | undefined,
}

export interface LegacyConfig { apiKey?: string; urls?: Record<string, string>; workspaceId?: string }
export function legacyConfig(): LegacyConfig {
  try { return JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf8')) as LegacyConfig }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error }
}

export function serviceUrl(service: Service): string {
  if (!isServiceName(service)) throw new Error(`Unsupported service: ${service}`)
  const raw = process.env[`AMENTOI_${service.toUpperCase()}_URL`] ?? legacyConfig().urls?.[service] ?? PRODUCTION_URLS[service]
  if (!raw) throw new Error(`Configure ${service}: amentoi-cli config set ${service} https://...`)
  const url = new URL(raw)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Service URL must use HTTPS')
  }
  return url.origin
}

export function selectedWorkspace(): string | undefined {
  return globalFlags.workspace ?? process.env.AMENTOI_WORKSPACE_ID ?? legacyConfig().workspaceId
}

export function setWorkspaceId(workspaceId: string): void {
  const config = legacyConfig()
  config.workspaceId = workspaceId
  mkdirSync(dirname(LEGACY_CONFIG_PATH), { recursive: true, mode: 0o700 })
  writeFileSync(LEGACY_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  chmodSync(LEGACY_CONFIG_PATH, 0o600)
}

export function setServiceUrl(service: Service, raw: string): void {
  if (!isServiceName(service)) throw new Error(`Unsupported service: ${service}`)
  const url = new URL(raw)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Service URL must use HTTPS')
  }
  const config = legacyConfig()
  config.urls = { ...config.urls, [service]: url.origin }
  mkdirSync(dirname(LEGACY_CONFIG_PATH), { recursive: true, mode: 0o700 })
  writeFileSync(LEGACY_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  chmodSync(LEGACY_CONFIG_PATH, 0o600)
}
