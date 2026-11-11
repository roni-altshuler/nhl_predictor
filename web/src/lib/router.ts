import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  window.addEventListener('popstate', callback)
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback) }
}
export function parseRoute(hash: string) {
  try {
    const url = new URL(hash.replace(/^#/, '') || '/', 'https://blueline.invalid')
    return { path: url.pathname.replace(/\/$/, '') || '/', params: url.searchParams }
  } catch { return { path: '/invalid-route', params: new URLSearchParams() } }
}
export type Route = ReturnType<typeof parseRoute>
export function href(path: string, params: URLSearchParams | Record<string, string | undefined> = {}): string {
  const query = params instanceof URLSearchParams ? new URLSearchParams(params) : new URLSearchParams(Object.entries(params).filter((pair): pair is [string, string] => pair[1] !== undefined))
  return `#${path}${query.size ? `?${query}` : ''}`
}
export function navigate(path: string, params: URLSearchParams | Record<string, string | undefined>, replace = false) {
  const next = href(path, params)
  if (replace) { window.history.replaceState(null, '', next); window.dispatchEvent(new HashChangeEvent('hashchange')) }
  else window.location.hash = next.slice(1)
}
export function patch(route: Route, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams(route.params)
  for (const [key, value] of Object.entries(changes)) { if (!value || (value === 'all' && key !== 'phase')) params.delete(key); else params.set(key, value) }
  navigate(route.path, params, true)
}
export function useRoute() { return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash, () => '#/')) }
