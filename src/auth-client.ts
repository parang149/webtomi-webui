let csrf = ''
let installed = false
export function setCsrf(value: string | null | undefined) { csrf = value || '' }
export function installAuthFetch() {
  if (installed) return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return original(input, init)
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    if (!['GET','HEAD','OPTIONS'].includes(method)) {
      headers.set('X-Hitomi-Request','1')
      if (csrf) headers.set('X-CSRF-Token',csrf)
    }
    const response = await original(input, { ...init, headers, credentials: 'same-origin' })
    if (response.status === 401 && !url.pathname.startsWith('/api/auth/')) window.dispatchEvent(new Event('hitomi-auth-expired'))
    return response
  }
}
