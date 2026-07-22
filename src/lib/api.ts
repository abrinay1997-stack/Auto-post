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

export type PostStatus =
  | 'draft'
  | 'image_pending'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'archived'

export interface Post {
  id: string
  brand_id: string
  status: PostStatus
  platform: string[]
  copy_text: string
  copy_variants: string[]
  image_prompt: string
  image_urls: string[] | null
  scheduled_at: string | null
  published_at: string | null
  batch_id: string
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
    request<{ batch_id: string; posts: Post[] }>('/generate-batch', {
      method: 'POST',
      body: JSON.stringify({ brand_id, brief, count }),
    }),
  listPosts: (brand_id: string) => request<{ posts: Post[] }>(`/posts?brand_id=${brand_id}`).then((d) => d.posts),
  updatePost: (id: string, input: { status?: PostStatus; copy_text?: string }) =>
    request<{ post: Post }>(`/posts?id=${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((d) => d.post),
  generateImage: (post_id: string) =>
    request<{ post: Post }>('/generate-image', { method: 'POST', body: JSON.stringify({ post_id }) }).then(
      (d) => d.post,
    ),
  regenerateCopy: (post_id: string) =>
    request<{ post: Post }>('/regenerate-copy', { method: 'POST', body: JSON.stringify({ post_id }) }).then(
      (d) => d.post,
    ),
  schedulePost: (post_id: string, scheduled_at: string) =>
    request<{ post: Post }>('/schedule-post', {
      method: 'POST',
      body: JSON.stringify({ post_id, scheduled_at }),
    }).then((d) => d.post),
}
