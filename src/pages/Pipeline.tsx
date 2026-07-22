import { useEffect, useState } from 'react'
import { api, type Brand, type Post, type PostStatus } from '../lib/api'

const COLUMNS: { status: PostStatus; label: string }[] = [
  { status: 'draft', label: 'Borrador' },
  { status: 'pending_approval', label: 'Pendiente de aprobación' },
  { status: 'approved', label: 'Aprobado' },
  { status: 'failed', label: 'Fallidos' },
  { status: 'archived', label: 'Descartado' },
]

function PostCard({ post, onChange }: { post: Post; onChange: (post: Post) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [copyText, setCopyText] = useState(post.copy_text)
  const [error, setError] = useState<string | null>(null)

  // Re-sincroniza si el copy cambió por fuera (ej. "Regenerar copy"), si no el textarea se queda con el texto viejo.
  useEffect(() => {
    setCopyText(post.copy_text)
  }, [post.copy_text])

  const run = async (label: string, action: () => Promise<Post>) => {
    setBusy(label)
    setError(null)
    try {
      onChange(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const imageUrl = post.image_urls?.[0]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full aspect-square object-cover rounded" />
      ) : (
        <div className="w-full aspect-square bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs">
          Sin imagen
        </div>
      )}

      <textarea
        value={copyText}
        onChange={(e) => setCopyText(e.target.value)}
        onBlur={() => copyText !== post.copy_text && run('save', () => api.updatePost(post.id, { copy_text: copyText }))}
        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
        rows={4}
      />

      <p className="text-xs text-slate-500">{post.platform?.join(', ')}</p>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {post.status === 'failed' && post.platform_results && (
        <div className="text-xs bg-red-950/50 border border-red-900 rounded p-2 space-y-1">
          {post.platform_results.map((r) => (
            <p key={r.platform} className={r.success ? 'text-emerald-400' : 'text-red-400'}>
              {r.platform}: {r.success ? `publicado (${r.postId})` : r.error}
            </p>
          ))}
          <p className="text-slate-400">
            Si alguna plataforma ya publicó, quita esa red de la lista de "platform" antes de reintentar para no
            duplicar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <button
          disabled={busy !== null}
          onClick={() => run('image', () => api.generateImage(post.id))}
          className="text-xs bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 disabled:opacity-50"
        >
          {busy === 'image' ? 'Generando…' : imageUrl ? 'Regenerar imagen' : 'Generar imagen'}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => run('copy', () => api.regenerateCopy(post.id))}
          className="text-xs bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 disabled:opacity-50"
        >
          {busy === 'copy' ? 'Regenerando…' : 'Regenerar copy'}
        </button>
        {post.status !== 'approved' && (
          <button
            disabled={busy !== null}
            onClick={() => run('approve', () => api.updatePost(post.id, { status: 'approved' }))}
            className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-2 py-1 disabled:opacity-50"
          >
            {post.status === 'failed' ? 'Reintentar (volver a Aprobado)' : 'Aprobar'}
          </button>
        )}
        {post.status !== 'archived' && (
          <button
            disabled={busy !== null}
            onClick={() => run('discard', () => api.updatePost(post.id, { status: 'archived' }))}
            className="text-xs bg-red-900 hover:bg-red-800 rounded px-2 py-1 disabled:opacity-50"
          >
            Descartar
          </button>
        )}
      </div>
    </div>
  )
}

export default function Pipeline() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [brief, setBrief] = useState('')
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listBrands().then((list) => {
      setBrands(list)
      if (list[0]) setBrandId(list[0].id)
    })
  }, [])

  const loadPosts = (id: string) => {
    if (!id) return
    api.listPosts(id).then(setPosts).catch((err) => setError(err.message))
  }

  useEffect(() => loadPosts(brandId), [brandId])

  const onGenerate = async () => {
    if (!brandId || !brief) return
    setGenerating(true)
    setError(null)
    try {
      await api.generateBatch(brandId, brief, count)
      loadPosts(brandId)
      setBrief('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar el lote')
    } finally {
      setGenerating(false)
    }
  }

  const updatePostInList = (updated: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Pipeline</h1>

      <div className="flex flex-wrap items-end gap-2">
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Brief del lote (ej. promo de temporada, 3 líneas)"
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 flex-1 min-w-[240px]"
        />
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 w-20"
          min={1}
          max={20}
        />
        <button
          onClick={onGenerate}
          disabled={generating || !brandId || !brief}
          className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-50"
        >
          {generating ? 'Generando lote…' : 'Generar lote'}
        </button>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.status} className="space-y-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
              {col.label} ({posts.filter((p) => p.status === col.status).length})
            </h2>
            <div className="space-y-3">
              {posts
                .filter((p) => p.status === col.status)
                .map((post) => (
                  <PostCard key={post.id} post={post} onChange={updatePostInList} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
