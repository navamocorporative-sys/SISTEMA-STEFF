import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  FileSignature,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  PackageCheck,
  Settings,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import logoWhite from '../assets/logo-steff-blanco.png'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'

const NAV = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true, admin: false },
  { to: '/eventos', label: 'Eventos', icon: CalendarDays, end: false, admin: false },
  { to: '/contratos', label: 'Contratos', icon: FileSignature, end: false, admin: false },
  { to: '/entregas', label: 'Entregas', icon: PackageCheck, end: false, admin: false },
  { to: '/finanzas', label: 'Finanzas', icon: Wallet, end: false, admin: true },
  { to: '/proveedores', label: 'Proveedores', icon: Truck, end: false, admin: true },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false, admin: false },
  { to: '/publicidad', label: 'Publicidad', icon: Megaphone, end: false, admin: false },
  { to: '/configuracion', label: 'Configuración', icon: Settings, end: false, admin: false },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, isAdmin, signOut } = useAuth()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center px-6 pb-6 pt-7">
        <img src={logoWhite} alt="STEFF" className="h-16 w-auto" />
      </div>
      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                isActive ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-100 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <n.icon className="h-[18px] w-[18px]" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={profile?.full_name || profile?.username || 'U'} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.full_name || profile?.username}</p>
            <p className="text-xs text-navy-200">{isAdmin ? 'Administrador' : 'Colaborador'}</p>
          </div>
          <button className="rounded-lg p-2 text-navy-200 transition hover:bg-white/10 hover:text-white" title="Cerrar sesión" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-gradient-to-b from-navy-900 to-navy-950 lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <img src={logoWhite} alt="STEFF" className="h-9 w-auto" />
        <button className="rounded-lg p-2 text-white hover:bg-white/10" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-gradient-to-b from-navy-900 to-navy-950 shadow-2xl">
            <button className="absolute right-3 top-3 rounded-lg p-2 text-white hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
