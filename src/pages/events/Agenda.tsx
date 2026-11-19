import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge, Card, ErrorBlock, LoadingBlock, PageHeader } from '../../components/ui'
import EventForm from '../../components/forms/EventForm'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { EVENT_SELECT, listStaff } from '../../lib/data'
import { EVENT_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { fmtLongDate, fmtTimeRange, isoDate } from '../../lib/format'
import type { EventWithClient } from '../../lib/types'

const dotTone: Record<string, string> = {
  cotizacion: 'bg-slate-100 text-slate-700 border-slate-300',
  confirmado: 'bg-sky-50 text-sky-800 border-sky-300',
  realizado: 'bg-violet-50 text-violet-800 border-violet-300',
  en_edicion: 'bg-amber-50 text-amber-800 border-amber-300',
  entregado: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  cancelado: 'bg-red-50 text-red-700 border-red-300 line-through',
}

interface AssignRow {
  event_id: string
  staff_id: string
  role: string
  staff: { full_name: string } | null
}

export default function Agenda() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<string>(isoDate(new Date()))
  const [formOpen, setFormOpen] = useState(false)

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const from = isoDate(gridStart)
  const to = isoDate(gridEnd)

  const q = useQuery(async () => {
    const events = await must<EventWithClient[]>(supabase.from('events').select(EVENT_SELECT).gte('event_date', from).lte('event_date', to).order('event_date'))
    const ids = events.map((e) => e.id)
    const [assigns, staff] = await Promise.all([
      ids.length ? must<AssignRow[]>(supabase.from('assignments').select('event_id, staff_id, role, staff(full_name)').in('event_id', ids)) : Promise.resolve([] as AssignRow[]),
      listStaff(),
    ])
    return { events, assigns, staff }
  }, [from, to])

  const byDay = useMemo(() => {
    const m = new Map<string, EventWithClient[]>()
    for (const e of q.data?.events ?? []) m.set(e.event_date, [...(m.get(e.event_date) ?? []), e])
    return m
  }, [q.data])

  const assignsByEvent = useMemo(() => {
    const m = new Map<string, AssignRow[]>()
    for (const a of q.data?.assigns ?? []) m.set(a.event_id, [...(m.get(a.event_id) ?? []), a])
    return m
  }, [q.data])

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const dayEvents = byDay.get(selected) ?? []
  const busyIds = new Set(dayEvents.filter((e) => e.status !== 'cancelado').flatMap((e) => (assignsByEvent.get(e.id) ?? []).map((a) => a.staff_id)))
  const available = (q.data?.staff ?? []).filter((s) => s.status === 'activo' && !busyIds.has(s.id))

  return (
    <div>
      <PageHeader
        title="Agenda de eventos"
        subtitle="Consulta la disponibilidad de fechas y del equipo."
        actions={
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo evento
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <button className="btn-icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mes anterior">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold capitalize">{format(month, 'MMMM yyyy', { locale: es })}</h2>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setMonth(startOfMonth(new Date()))
                  setSelected(isoDate(new Date()))
                }}
              >
                Hoy
              </button>
            </div>
            <button className="btn-icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mes siguiente">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          {q.loading && !q.data ? (
            <LoadingBlock />
          ) : q.error ? (
            <div className="p-4">
              <ErrorBlock message={q.error} onRetry={q.reload} />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = isoDate(d)
                const evs = byDay.get(key) ?? []
                const inMonth = isSameMonth(d, month)
                const sel = key === selected
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 text-left align-top transition hover:bg-navy-50/40 ${inMonth ? 'bg-white' : 'bg-slate-50/70'} ${
                      sel ? 'ring-2 ring-inset ring-navy-500' : ''
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday(d) ? 'bg-navy-900 text-white' : inMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {format(d, 'd')}
                    </span>
                    <div className="mt-1 space-y-1">
                      {evs.slice(0, 3).map((e) => (
                        <div key={e.id} className={`truncate rounded border px-1 py-0.5 text-[11px] font-medium ${dotTone[e.status] ?? dotTone.confirmado}`}>
                          {e.event_type} · {e.clients?.full_name ?? ''}
                        </div>
                      ))}
                      {evs.length > 3 && <div className="text-[11px] font-semibold text-slate-500">+{evs.length - 3} más</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card
            title={fmtLongDate(selected)}
            actions={
              <button className="btn-ghost btn-sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Evento
              </button>
            }
          >
            {dayEvents.length === 0 ? (
              <p className="text-sm text-emerald-700">Fecha disponible: no hay eventos registrados.</p>
            ) : (
              <div className="space-y-3">
                {dayEvents.map((e) => (
                  <button key={e.id} className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-navy-300" onClick={() => navigate(`/eventos/${e.id}`)}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-navy-900">{e.event_type}</p>
                      <Badge tone={optionTone(EVENT_STATUS, e.status)}>{optionLabel(EVENT_STATUS, e.status)}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">{e.clients?.full_name}</p>
                    <p className="text-xs text-slate-400">
                      {fmtTimeRange(e.evento_start, e.evento_end) || fmtTimeRange(e.misa_start, e.misa_end) || 'Sin horario'} · {e.evento_place || e.misa_place || e.sesion_place || 'Sin lugar'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(assignsByEvent.get(e.id) ?? []).map((a) => (
                        <span key={`${a.staff_id}-${a.role}`} className="rounded bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy-800">
                          {a.staff?.full_name ?? ''} · {a.role}
                        </span>
                      ))}
                      {(assignsByEvent.get(e.id) ?? []).length === 0 && <span className="text-xs text-amber-700">Sin equipo asignado</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <Card title="Equipo disponible ese día">
            {available.length === 0 ? (
              <p className="text-sm text-slate-500">No hay personas activas disponibles.</p>
            ) : (
              <ul className="space-y-2">
                {available.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{s.full_name}</span>
                    <span className="truncate text-xs text-slate-400">{s.roles.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <EventForm open={formOpen} onClose={() => setFormOpen(false)} defaultDate={selected} onSaved={(ev) => navigate(`/eventos/${ev.id}`)} />
    </div>
  )
}
