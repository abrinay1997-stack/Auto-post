import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const url = new URL(req.url)
  const key = url.pathname.split('/images/')[1]
  if (!key) return new Response('Falta la clave de la imagen', { status: 400 })

  const store = getStore('post-images')
  const blob = await store.getWithMetadata(key, { type: 'arrayBuffer' })
  if (!blob) return new Response('Imagen no encontrada', { status: 404 })

  const contentType = (blob.metadata?.contentType as string) ?? 'image/png'
  return new Response(blob.data, {
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
  })
}
