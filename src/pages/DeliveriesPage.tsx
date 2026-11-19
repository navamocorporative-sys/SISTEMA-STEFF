import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Pencil, Plus, Scissors, UserCheck } from 'lucide-react'
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput, StatCard } from '../components/ui'
import DeliveryForm from '../components/forms/DeliveryForm'
import { useQuery } from '../hooks/useQuery'
import { supabase, must } from '../lib/supabase'
import { listStaff } from '../lib/data'
import { DELIVERY_STATUS, EVENT_STATUS, serviceLabel } from '../lib/constants'
import { daysUntil, fmtDate, todayISO } from '../lib/format'
import type { Delivery, DeliveryStatus, EventStatus } from '../lib/types'
import { useToast } from '../context/ToastContext'

interface DeliveryRow extends Delivery {
  events: {
    id: string
    project_number: string
    event_type: string
    event_date: string
    status: EventStatus
    clients: { full_name: string } | null
  } | null
}

type Filter = 'pendientes' | 'vencidas' | 'entregadas' | 'todas'

export default function DeliveriesPage() {
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('pendientes')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Delivery | null>(null)

  const q = useQuery(async () => {
    const [rows, staff] = await Promise.all([
      must<DeliveryRow[]>(
        supabase
          .from('deliveries')
          .select('*, events(id, project_number, event_type, event_date, status, clients(full_name))')
          .order('due_date', { ascending: true, nullsFirst: false }),
      ),
      listStaff(),
    ])
    return { rows, staff: new Map(staff.map((s) => [s.id, s.full_name])) }
  }, [])

  const today = todayISO()
  const all = q.data?.rows ?? []
  const pending = all.filter((d) => d.status !== 'entregado')
  const overdue = pending.filter((d) => d.due_date && d.due_date < today)

  const rows = useMemo(() => {
    let list = all
    if (filter === 'pendientes') list = pending
    if (filter === 'vencidas') list = overdue
    if (filter === 'entregadas') list = all.filter((d) => d.status === 'entregado').sort((a, b) => (b.delivered_on ?? '').localeCompare(a.delivered_on ?? ''))
    const s = search.trim().toLowerCase()
    if (s) list = list.filter((d) => `${d.events?.clients?.full_name ?? ''} ${d.events?.event_type ?? ''} ${d.events?.project_number ?? ''} ${d.service}`.toLowerCase().includes(s))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, filter, search])

  const updateDelivery = async (d: DeliveryRow, status: DeliveryStatus) => {
    try {
      const patch = { status, delivered_on: status === 'entregado' ? d.delivered_on ?? todayISO() : d.delivered_on }
      await must(supabase.from('deliveries').update(patch).eq('id', d.id).select('id').single())
      q.setData((p) => (p ? { ...p, rows: p.rows.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) } : p!))
      toast.success('Estatus de entrega actualizado')
    } catch (e) {
      toast.error(e)
    }
  }

  const updateEvent = async (eventId: string, status: EventStatus) => {
    try {
      await must(supabase.from('events').update({ status }).eq('id', eventId).select('id').single())
      q.setData((p) => (p ? { ...p, rows: p.rows.map((x) => (x.events && x.events.id === eventId ? { ...x, events: { ...x.events, status } } : x)) } : p!))
      toast.success('Estatus del evento actualizado')
    } catch (e) {
      toast.error(e)
    }
  }

  const count = (s: DeliveryStatus) => all.filter((d) => d.status === s).length
  const deliveredMonth = all.filter((d) => d.status === 'entregado' && (d.delivered_on ?? '').startsWith(today.slice(0, 7))).length

  return (
    <div>
      <PageHeader
        title="Entregas"
        subtitle="Registro de estatus de cada evento y de la entrega de su material."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Registrar entrega
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Pendientes" value={count('pendiente')} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="En edición" value={count('en_edicion')} icon={<Scissors className="h-5 w-5" />} tone="amber" />
        <StatCard label="Selección del cliente" value={count('seleccion_cliente')} icon={<UserCheck className="h-5 w-5" />} tone="blue" />
        <StatCard label="Vencidas" value={overdue.length} icon={<AlertTriangle className="h-5 w-5" />} tone={overdue.length ? 'red' : 'green'} onClick={() => setFilter('vencidas')} />
        <StatCard label="Entregadas este mes" value={deliveredMonth} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
            {(
              [
                ['pendientes', `Por entregar (${pending.length})`],
                ['vencidas', `Vencidas (${overdue.length})`],
                ['entregadas', 'Entregadas'],
                ['todas', 'Todas'],
              ] as [Filter, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${filter === v ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Cliente, proyecto, material…" />
        </div>

        {q.loading && !q.data ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBlock message={q.error} onRetry={q.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nada por aquí" text="Las entregas se crean solas al registrar un evento con servicios, o puedes registrarlas manualmente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Estatus del evento</th>
                  <th>Material</th>
                  <th>Edición</th>
                  <th>Fecha límite</th>
                  <th>Estatus de entrega</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const days = d.due_date ? daysUntil(d.due_date) : null
                  const late = d.status !== 'entregado' && days !== null && days < 0
                  return (
                    <tr key={d.id}>
                      <td>
                        {d.events ? (
                          <Link to={`/eventos/${d.events.id}`} className="block hover:underline">
                            <span className="font-semibold text-navy-900">{d.events.clients?.full_name ?? '—'}</span>
                            <span className="block text-xs text-slate-500">
                              {d.events.event_type} · {fmtDate(d.events.event_date)} · {d.events.project_number}
                            </span>
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {d.events && (
                          <select
                            className="input w-36 py-1.5 text-xs"
                            value={d.events.status}
                            onChange={(e) => d.events && void updateEvent(d.events.id, e.target.value as EventStatus)}
                          >
                            {EVENT_STATUS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="font-medium">
                        {serviceLabel(d.service)}
                        {d.link && (
                          <a href={d.link} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-navy-600" title="Abrir enlace">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                      <td className="text-sm">
                        {d.editor_id ? q.data?.staff.get(d.editor_id) ?? '—' : '—'}
                        {d.edit_day && <span className="block text-xs text-slate-400">{d.edit_day}</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {d.status === 'entregado' ? (
                          <span className="text-sm text-emerald-700">Entregado {fmtDate(d.delivered_on)}</span>
                        ) : d.due_date ? (
                          <>
                            <span className={late ? 'font-semibold text-red-600' : ''}>{fmtDate(d.due_date)}</span>
                            <span className={`block text-xs ${late ? 'text-red-600' : 'text-slate-400'}`}>
                              {late ? `Vencida hace ${Math.abs(days ?? 0)} día(s)` : days === 0 ? 'Vence hoy' : `Faltan ${days} día(s)`}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <select className="input w-44 py-1.5 text-xs" value={d.status} onChange={(e) => void updateDelivery(d, e.target.value as DeliveryStatus)}>
                          {DELIVERY_STATUS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right">
                        <button
                          className="btn-icon"
                          onClick={() => {
                            setEditing(d)
                            setOpen(true)
                          }}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <DeliveryForm open={open} onClose={() => setOpen(false)} delivery={editing} onSaved={() => void q.reload()} />
    </div>
  )
}
