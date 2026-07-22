import { useEffect, useState } from 'react'
import { api, type Brand, type PostMetric, type BestTime, type BrandInsight } from '../lib/api'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function Metrics() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [perPost, setPerPost] = useState<PostMetric[]>([])
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [insights, setInsights] = useState<BrandInsight[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listBrands().then((list) => {
      setBrands(list)
      if (list[0]) setBrandId(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (!brandId) return
    api
      .getMetrics(brandId)
      .then(({ perPost, bestTimes, insights }) => {
        setPerPost(perPost)
        setBestTimes(bestTimes)
        setInsights(insights)
      })
      .catch((err) => setError(err.message))
  }, [brandId])

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Métricas</h1>

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

      {error && <p className="text-red-400">{error}</p>}

      <section>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">Aprendizajes recientes</h2>
        {insights.length === 0 && <p className="text-slate-500 text-sm">Todavía no hay análisis (analyze-brand.ts corre semanalmente).</p>}
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded p-3 text-sm">
              <p>{insight.content.viral_pattern}</p>
              {insight.content.recommendation && (
                <p className="text-emerald-400 mt-1">→ {insight.content.recommendation}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">Mejores horarios</h2>
        {bestTimes.length === 0 && <p className="text-slate-500 text-sm">Aún no hay suficientes datos.</p>}
        <ul className="text-sm space-y-1">
          {bestTimes.map((bt, i) => (
            <li key={i} className="text-slate-300">
              {WEEKDAYS[bt.weekday]} {bt.hour}:00 — engagement promedio {(bt.avg_engagement * 100).toFixed(1)}% ({bt.sample_size} posts)
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">Engagement por post</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4">Post</th>
                <th className="py-2 pr-4">Likes</th>
                <th className="py-2 pr-4">Comentarios</th>
                <th className="py-2 pr-4">Compartidos</th>
                <th className="py-2 pr-4">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {perPost.map((post) => (
                <tr key={post.id} className="border-b border-slate-900">
                  <td className="py-2 pr-4 max-w-xs truncate">{post.copy_text}</td>
                  <td className="py-2 pr-4">{post.likes}</td>
                  <td className="py-2 pr-4">{post.comments}</td>
                  <td className="py-2 pr-4">{post.shares}</td>
                  <td className="py-2 pr-4">{post.engagement_rate ? `${(post.engagement_rate * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {perPost.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-500">
                    Todavía no hay métricas sincronizadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
