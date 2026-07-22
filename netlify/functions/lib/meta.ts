// Integración directa con la Graph API de Meta — reemplaza a Postiz (2026-07-22).
// Instagram no soporta programación nativa vía API (siempre publica de inmediato al llamar
// media_publish), así que la "programación" la maneja publish-due-posts.ts con su propio cron.
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

export interface PublishResult {
  platform: string
  success: boolean
  postId?: string
  error?: string
}

export async function publishToFacebook(
  pageId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const res = await fetch(`${GRAPH_API_BASE}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, caption, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok) return { platform: 'facebook', success: false, error: data?.error?.message ?? JSON.stringify(data) }
  return { platform: 'facebook', success: true, postId: data.post_id ?? data.id }
}

export async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const createRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) {
    return { platform: 'instagram', success: false, error: createData?.error?.message ?? JSON.stringify(createData) }
  }

  const publishRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: accessToken }),
  })
  const publishData = await publishRes.json()
  if (!publishRes.ok) {
    return { platform: 'instagram', success: false, error: publishData?.error?.message ?? JSON.stringify(publishData) }
  }
  return { platform: 'instagram', success: true, postId: publishData.id }
}

export async function publishToMeta(
  platform: string,
  brand: { meta_page_id: string | null; meta_ig_user_id: string | null; meta_page_access_token: string | null },
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  if (!brand.meta_page_access_token) {
    return { platform, success: false, error: 'La marca no tiene meta_page_access_token configurado' }
  }
  if (platform === 'facebook') {
    if (!brand.meta_page_id) return { platform, success: false, error: 'La marca no tiene meta_page_id configurado' }
    return publishToFacebook(brand.meta_page_id, brand.meta_page_access_token, imageUrl, caption)
  }
  if (platform === 'instagram') {
    if (!brand.meta_ig_user_id) return { platform, success: false, error: 'La marca no tiene meta_ig_user_id configurado' }
    return publishToInstagram(brand.meta_ig_user_id, brand.meta_page_access_token, imageUrl, caption)
  }
  return { platform, success: false, error: `Plataforma no soportada: ${platform}` }
}
