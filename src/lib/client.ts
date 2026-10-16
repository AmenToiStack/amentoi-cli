import { getToken } from './auth.js'
import { selectedWorkspace, serviceUrl, type Service } from './config.js'
import { CliError } from './errors.js'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
type Body = Record<string, unknown> | unknown[] | undefined

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) })
  const result = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
  if (!response.ok) throw new CliError(response.status, result?.error?.message ?? response.statusText)
  return result
}

function endpoint(base: string, path: string, query?: Record<string, string | undefined>): string {
  if (!path.startsWith('/v1/') || path.startsWith('//')) throw new Error('Only /v1/ paths are allowed')
  const url = new URL(path, base)
  if (url.origin !== new URL(base).origin) throw new Error('Cross-origin API path refused')
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, value)
  return url.toString()
}

async function headersFor(service: Service): Promise<Record<string, string>> {
  const key = getToken()
  const workspaceId = selectedWorkspace()
  const coreHeaders = { 'x-api-key': key, ...(workspaceId ? { 'x-amen-workspace-id': workspaceId } : {}) }
  if (service === 'core') return coreHeaders
  const response = await fetchJson(endpoint(serviceUrl('core'), `/v1/products/${service}/key-session`), {
    method: 'POST', headers: coreHeaders,
  }) as { data?: { token?: string } }
  if (!response.data?.token) throw new Error(`Core returned no ${service} session token`)
  return { Authorization: `Bearer ${response.data.token}` }
}

export async function request(service: Service, method: Method, path: string, body?: Body, query?: Record<string, string | undefined>, extraHeaders?: Record<string, string>): Promise<unknown> {
  const headers = await headersFor(service)
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  Object.assign(headers, extraHeaders)
  return fetchJson(endpoint(serviceUrl(service), path, query), {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export const USER_TOKEN_ENV = 'AMENTOI_USER_TOKEN'

/**
 * Core routes that act for a signed-in person (product connections) accept a user bearer token and
 * refuse API keys. The CLI has no sign-in flow: it reads a user access token from the environment.
 * The token is sent only to Core and is never printed.
 */
export async function userRequest(method: Method, path: string, body?: Body): Promise<unknown> {
  const token = process.env[USER_TOKEN_ENV]?.trim()
  if (!token) {
    throw new CliError(401, 'This command needs a signed-in user session; a workspace API key cannot call it.',
      `Set ${USER_TOKEN_ENV} to the Amen Identity access token of a user allowed to install products, or use the console.`)
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return fetchJson(endpoint(serviceUrl('core'), path), {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export function clientFor(service: Service) {
  return {
    get: (path: string, query?: Record<string, string | undefined>) => request(service, 'GET', path, undefined, query),
    post: (path: string, body?: Body) => request(service, 'POST', path, body),
    patch: (path: string, body?: Body) => request(service, 'PATCH', path, body),
    put: (path: string, body?: Body) => request(service, 'PUT', path, body),
    delete: (path: string) => request(service, 'DELETE', path),
  }
}

export async function requestBytes(service: Service, method: Method, path: string, body?: Body): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const headers = await headersFor(service)
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(endpoint(serviceUrl(service), path), {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new CliError(response.status, result?.error?.message ?? response.statusText)
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') }
}

export async function uploadBytes(service: Service, path: string, bytes: Uint8Array, contentType: string, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<unknown> {
  const headers = await headersFor(service)
  headers['Content-Type'] = contentType
  const response = await fetch(endpoint(serviceUrl(service), path), {
    method, headers, body: new Blob([Uint8Array.from(bytes)]), redirect: 'error', signal: AbortSignal.timeout(30_000),
  })
  const result = await response.json().catch(() => null) as { error?: { message?: string } } | null
  if (!response.ok) throw new CliError(response.status, result?.error?.message ?? response.statusText)
  return result
}
