import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput } from '../../components/ui'
import EventForm from '../../components/forms/EventForm'
import { useQuery } from '../../hooks/useQuery'
import { listEventFinance, listEvents } from '../../lib/data'
import { EVENT_STATUS, optionLabel, optionTone, serviceLabel } from '../../lib/constants'
import { daysUntil, fmtDate, fmtMoney, todayISO } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import type { EventFinance, EventStatus } from '../../lib/types'

type Scope = 'proximos' | 'pasados' | 'todos'

export default function EventsList() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const q = useQuery(async () => {
    const [events, fin] = await Promise.all([listEvents(), isAdmin ? listEventFinance() : Promise.resolve(new Map<string, EventFinance>())])
    return { events, fin }
  }, [isAdmin])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<EventStatus | ''>('')
  const [scope, setScope] = useState<Scope>('proximos')
  const [formOpen, setFormOpen] = useState(false)

  const rows = useMemo(() => {
    const today = todayISO()
    const s = search.trim().toLowerCase()
    let list = q.data?.events ?? []
    if (scope === 'proximos') list = list.filter((e) => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))
    if (scope === 'pasados') list = list.filter((e) => e.event_date < today)
    if (status) list = list.filter((e) => e.status === status)
    if (s)
      list = list.filter((e) =>
        [e.project_number, e.event_type, e.main_names, e.clients?.full_name ?? '', e.evento_place].join(' ').toLowerCase().includes(s),
      )
    return list
  }, [q.data, search, status, scope])

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle="Datos del cliente y del evento, venta, equipo asignado, familiares, respaldos y entregas."
        actions={
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo evento
          </button>
        }
      />

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {(
              [
                ['proximos', 'Próximos'],
                ['pasados', 'Pasados'],
                ['todos', 'Todos'],
              ] as [Scope, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setScope(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${scope === v ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as EventStatus | '')}>
              <option value="">Todos los estatus</option>
              {EVENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <SearchInput value={search} onChange={setSearch} placeholder="Cliente, proyecto, tipo, lugar…" />
          </div>
        </div>

        {q.loading && !q.data ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBlock message={q.error} onRetry={q.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No hay eventos para mostrar"
            text={scope === 'proximos' ? 'No tienes eventos próximos registrados.' : 'Prueba con otros filtros.'}
            action={
              <button className="btn-primary" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Registrar evento
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proyecto</th>
                  <th>Cliente / evento</th>
                  <th>Servicios</th>
                  <th>Lugar</th>
                  {isAdmin && <th className="text-right">Venta</th>}
                  {isAdmin && <th className="text-right">Saldo</th>}
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const fin = q.data?.fin.get(e.id)
                  const d = daysUntil(e.event_date)
                  return (
                    <tr key={e.id} className="row-link" onClick={() => navigate(`/eventos/${e.id}`)}>
                      <td className="whitespace-nowrap">
                        <p className="font-semibold text-navy-900">{fmtDate(e.event_date, 'EEE d MMM yyyy')}</p>
                        {d >= 0 && d <= 30 && <p className="text-xs text-amber-600">{d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`}</p>}
                      </td>
                      <td className="font-mono text-xs text-slate-500">{e.project_number}</td>
                      <td>
                        <p className="font-semibold text-slate-800">{e.clients?.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-500">
                          {e.event_type}
                          {e.main_names ? ` · ${e.main_names}` : ''}
                        </p>
                      </td>
                      <td className="text-xs text-slate-600">{e.services.map(serviceLabel).join(', ') || '—'}</td>
                      <td className="max-w-[180px] truncate text-slate-600">{e.evento_place || e.misa_place || e.sesion_place || '—'}</td>
                      {isAdmin && <td className="whitespace-nowrap text-right font-medium">{fmtMoney(e.total_amount)}</td>}
                      {isAdmin && (
                        <td className={`whitespace-nowrap text-right font-medium ${fin && fin.balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {fin ? fmtMoney(fin.balance) : '—'}
                        </td>
                      )}
                      <td>
                        <Badge tone={optionTone(EVENT_STATUS, e.status)}>{optionLabel(EVENT_STATUS, e.status)}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EventForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(ev) => navigate(`/eventos/${ev.id}`)} />
    </div>
  )
}
