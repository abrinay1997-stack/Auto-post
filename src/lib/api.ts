import { clearToken, getToken } from './auth'

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
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Sesión expirada')
  }
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
  getMetrics: (brand_id: string) =>
    request<{ perPost: PostMetric[]; bestTimes: BestTime[]; insights: BrandInsight[] }>(
      `/metrics?brand_id=${brand_id}`,
    ),
}

export interface PostMetric {
  id: string
  copy_text: string
  published_at: string
  likes: number
  comments: number
  shares: number
  reach: number
  impressions: number
  engagement_rate: number | null
}

export interface BestTime {
  weekday: number
  hour: number
  avg_engagement: number
  sample_size: number
}

export interface BrandInsight {
  insight_type: string
  content: { viral_pattern?: string; recommendation?: string; top_hashtags?: string[] }
  created_at: string
}
