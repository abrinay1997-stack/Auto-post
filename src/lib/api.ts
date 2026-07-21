export interface Brand {
  id: string
  name: string
  slug: string
  voice_profile: unknown
  visual_profile: unknown
  audience: unknown
  hashtag_sets: unknown
  created_at: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

export const api = {
  listBrands: () => request<{ brands: Brand[] }>('/brands').then((d) => d.brands),
  createBrand: (input: Pick<Brand, 'name' | 'slug'>) =>
    request<{ brand: Brand }>('/brands', { method: 'POST', body: JSON.stringify(input) }).then((d) => d.brand),
  generateBatch: (brand_id: string, brief: string, count?: number) =>
    request<{ batch_id: string; posts: unknown[] }>('/generate-batch', {
      method: 'POST',
      body: JSON.stringify({ brand_id, brief, count }),
    }),
}
