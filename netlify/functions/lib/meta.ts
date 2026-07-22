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

// Instagram procesa el contenedor de media de forma asíncrona (descarga la imagen, la valida).
// Publicar con media_publish antes de que status_code sea FINISHED devuelve error — hay que
// esperar el resultado (polling), no basta con que la creación del contenedor haya respondido 200.
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  { attempts = 10, intervalMs = 1500 } = {},
): Promise<{ ready: boolean; error?: string }> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`,
    )
    const data = await res.json()
    if (!res.ok) return { ready: false, error: data?.error?.message ?? JSON.stringify(data) }
    if (data.status_code === 'FINISHED') return { ready: true }
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
      return { ready: false, error: `El contenedor de Instagram terminó en estado ${data.status_code}` }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return { ready: false, error: 'Timeout esperando a que Instagram procese el contenedor de media' }
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

  const ready = await waitForContainerReady(createData.id, accessToken)
  if (!ready.ready) {
    return { platform: 'instagram', success: false, error: ready.error ?? 'El contenedor de media no quedó listo' }
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
