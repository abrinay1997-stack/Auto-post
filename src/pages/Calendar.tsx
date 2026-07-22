import { useEffect, useMemo, useState } from 'react'
import { api, type Brand, type Post } from '../lib/api'

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // semana empieza en lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = Array(startOffset).fill(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function ScheduleRow({ post, onScheduled }: { post: Post; onScheduled: (post: Post) => void }) {
  const [datetime, setDatetime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSchedule = async () => {
    if (!datetime) return
    setBusy(true)
    setError(null)
    try {
      onScheduled(await api.schedulePost(post.id, new Date(datetime).toISOString()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al programar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 rounded p-2">
      <p className="text-sm flex-1 min-w-[200px] truncate">{post.copy_text}</p>
      <input
        type="datetime-local"
        value={datetime}
        onChange={(e) => setDatetime(e.target.value)}
        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm"
      />
      <button
        onClick={onSchedule}
        disabled={busy || !datetime}
        className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-3 py-1 disabled:opacity-50"
      >
        {busy ? 'Programando…' : 'Programar'}
      </button>
      {error && <p className="text-xs text-red-400 w-full">{error}</p>}
    </div>
  )
}

export default function Calendar() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const today = new Date()
  const [year] = useState(today.getFullYear())
  const [month] = useState(today.getMonth())

  useEffect(() => {
    api.listBrands().then((list) => {
      setBrands(list)
      if (list[0]) setBrandId(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (brandId) api.listPosts(brandId).then(setPosts)
  }, [brandId])

  const approvedPosts = posts.filter((p) => p.status === 'approved')
  const scheduledByDay = useMemo(() => {
    const map = new Map<number, Post[]>()
    for (const post of posts) {
      const dateStr = post.scheduled_at ?? post.published_at
      if (!dateStr) continue
      const date = new Date(dateStr)
      if (date.getFullYear() !== year || date.getMonth() !== month) continue
      const list = map.get(date.getDate()) ?? []
      list.push(post)
      map.set(date.getDate(), list)
    }
    return map
  }, [posts, year, month])

  const cells = buildMonthGrid(year, month)
  const monthLabel = new Date(year, month, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })

  const onScheduled = (updated: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Calendario</h1>

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

      {approvedPosts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Aprobados por programar</h2>
          {approvedPosts.map((post) => (
            <ScheduleRow key={post.id} post={post} onScheduled={onScheduled} />
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2 capitalize">{monthLabel}</h2>
        <div className="grid grid-cols-7 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden text-xs">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="bg-slate-900 p-2 text-slate-500 text-center">
              {d}
            </div>
          ))}
          {cells.map((day, i) => (
            <div key={i} className="bg-slate-950 min-h-[80px] p-1 space-y-1">
              {day && <p className="text-slate-500">{day}</p>}
              {day &&
                (scheduledByDay.get(day) ?? []).map((post) => (
                  <p
                    key={post.id}
                    className={`truncate rounded px-1 ${
                      post.status === 'published' ? 'bg-emerald-900 text-emerald-300' : 'bg-sky-900 text-sky-300'
                    }`}
                    title={post.copy_text}
                  >
                    {post.copy_text}
                  </p>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
