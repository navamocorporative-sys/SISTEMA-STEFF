import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { LoadingBlock } from './components/ui'
import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const EventsLayout = lazy(() => import('./pages/events/EventsLayout'))
const EventsList = lazy(() => import('./pages/events/EventsList'))
const Agenda = lazy(() => import('./pages/events/Agenda'))
const StaffPage = lazy(() => import('./pages/events/StaffPage'))
const EquipmentPage = lazy(() => import('./pages/events/EquipmentPage'))
const BackupsPage = lazy(() => import('./pages/events/BackupsPage'))
const EventDetail = lazy(() => import('./pages/events/EventDetail'))
const ContractsPage = lazy(() => import('./pages/contracts/ContractsPage'))
const ContractEditor = lazy(() => import('./pages/contracts/ContractEditor'))
const TemplateEditor = lazy(() => import('./pages/contracts/TemplateEditor'))
const DeliveriesPage = lazy(() => import('./pages/DeliveriesPage'))
const FinancePage = lazy(() => import('./pages/finance/FinancePage'))
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'))
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'))
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail'))
const AdsPage = lazy(() => import('./pages/ads/AdsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return (
      <div className="card p-10 text-center">
        <h2 className="text-lg font-bold">Acceso solo para el administrador</h2>
        <p className="mt-2 text-sm text-slate-500">Esta sección contiene información financiera y solo la puede ver el administrador.</p>
      </div>
    )
  }
  return <>{children}</>
}

function Page({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingBlock />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  const { session, ready, profile, profileError, signOut } = useAuth()

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock text="Iniciando…" />
      </div>
    )
  }

  if (!session) return <Login />

  if (!profile) {
    if (!profileError) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <LoadingBlock text="Cargando tu perfil…" />
        </div>
      )
    }
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h2 className="text-lg font-bold">No se pudo cargar tu perfil</h2>
          <p className="mt-2 text-sm text-slate-500">{profileError}</p>
          <button className="btn-primary mt-6" onClick={() => void signOut()}>
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  if (!profile.active) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h2 className="text-lg font-bold">Tu usuario está desactivado</h2>
          <p className="mt-2 text-sm text-slate-500">Pide al administrador que active tu acceso.</p>
          <button className="btn-primary mt-6" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Page><Dashboard /></Page>} />
        <Route path="eventos" element={<Page><EventsLayout /></Page>}>
          <Route index element={<Page><EventsList /></Page>} />
          <Route path="agenda" element={<Page><Agenda /></Page>} />
          <Route path="equipo" element={<Page><StaffPage /></Page>} />
          <Route path="entrega-equipo" element={<Page><EquipmentPage /></Page>} />
          <Route path="respaldos" element={<Page><BackupsPage /></Page>} />
        </Route>
        <Route path="eventos/:id" element={<Page><EventDetail /></Page>} />
        <Route path="contratos" element={<Page><ContractsPage /></Page>} />
        <Route path="contratos/nuevo" element={<Page><ContractEditor /></Page>} />
        <Route path="contratos/:id" element={<Page><ContractEditor /></Page>} />
        <Route path="contratos/plantillas/:id" element={<Page><AdminOnly><TemplateEditor /></AdminOnly></Page>} />
        <Route path="entregas" element={<Page><DeliveriesPage /></Page>} />
        <Route path="finanzas" element={<Page><AdminOnly><FinancePage /></AdminOnly></Page>} />
        <Route path="proveedores" element={<Page><AdminOnly><SuppliersPage /></AdminOnly></Page>} />
        <Route path="clientes" element={<Page><ClientsPage /></Page>} />
        <Route path="clientes/:id" element={<Page><ClientDetail /></Page>} />
        <Route path="publicidad" element={<Page><AdsPage /></Page>} />
        <Route path="configuracion" element={<Page><SettingsPage /></Page>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
