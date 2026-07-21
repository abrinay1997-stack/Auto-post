import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'
import Pipeline from './pages/Pipeline'
import Calendar from './pages/Calendar'
import Metrics from './pages/Metrics'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/brands', label: 'Marcas' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/calendar', label: 'Calendario' },
  { to: '/metrics', label: 'Métricas' },
]

function App() {
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
