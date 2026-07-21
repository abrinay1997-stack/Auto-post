import { useEffect, useState } from 'react'
import { api, type Brand } from '../lib/api'

export default function Brands() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const load = () => {
    setLoading(true)
    api
      .listBrands()
      .then(setBrands)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.createBrand({ name, slug })
      setName('')
      setSlug('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la marca')
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Marcas</h1>

      <form onSubmit={onCreate} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 flex-1"
          required
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 flex-1"
          required
        />
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2">
          Crear
        </button>
      </form>

      {error && <p className="text-red-400">{error}</p>}
      {loading ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {brands.map((brand) => (
            <li key={brand.id} className="py-3">
              <p className="font-medium">{brand.name}</p>
              <p className="text-sm text-slate-400">{brand.slug}</p>
            </li>
          ))}
          {brands.length === 0 && <p className="text-slate-400">Todavía no hay marcas.</p>}
        </ul>
      )}
    </div>
  )
}
