const TOKEN_KEY = 'auto-post-token'

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function login(password: string): Promise<void> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await res.json()
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error al iniciar sesión')
  setToken(data.token)
}
