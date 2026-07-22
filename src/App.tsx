import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'
import Pipeline from './pages/Pipeline'
import Calendar from './pages/Calendar'
import Metrics from './pages/Metrics'
import { getToken, login } from './lib/auth'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/brands', label: 'Marcas' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/calendar', label: 'Calendario' },
  { to: '/metrics', label: 'Métricas' },
]

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <form onSubmit={onSubmit} className="space-y-3 w-72">
        <h1 className="text-xl font-semibold text-center">Auto Post</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-50"
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()))

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <nav className="border-b border-slate-800 px-6 py-3 flex gap-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `text-sm ${isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/brands" element={<Brands />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/metrics" element={<Metrics />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
