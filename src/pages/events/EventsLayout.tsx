import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, CalendarRange, HardDrive, Package, Users } from 'lucide-react'
import { LoadingBlock } from '../../components/ui'

const TABS = [
  { to: '/eventos', label: 'Eventos', icon: CalendarDays, end: true },
  { to: '/eventos/agenda', label: 'Agenda', icon: CalendarRange, end: false },
  { to: '/eventos/equipo', label: 'Equipo humano', icon: Users, end: false },
  { to: '/eventos/entrega-equipo', label: 'Entrega de equipo', icon: Package, end: false },
  { to: '/eventos/respaldos', label: 'Respaldos y material', icon: HardDrive, end: false },
]

export default function EventsLayout() {
  return (
    <div>
      <div className="scrollbar-thin -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                isActive ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800'
              }`
            }
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </NavLink>
        ))}
      </div>
      <Suspense fallback={<LoadingBlock />}>
        <Outlet />
      </Suspense>
    </div>
  )
}
