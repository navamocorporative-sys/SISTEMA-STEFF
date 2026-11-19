import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  FileSignature,
  HardDrive,
  Megaphone,
  Package,
  PackageCheck,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge, Card, ErrorBlock, LoadingBlock, StatCard } from '../components/ui'
import EventForm from '../components/forms/EventForm'
import ClientForm from '../components/forms/ClientForm'
import { useQuery } from '../hooks/useQuery'
import { supabase, must } from '../lib/supabase'
import { listEventFinance, listEvents } from '../lib/data'
import { DELIVERY_STATUS, EVENT_STATUS, optionLabel, optionTone, serviceLabel } from '../lib/constants'
import { daysUntil, fmtDate, fmtMoney, num, todayISO } from '../lib/format'
import type { AdCampaign, Backup, Delivery, EventFinance, Expense } from '../lib/types'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [eventOpen, setEventOpen] = useState(false)
  const [clientOpen, setClientOpen] = useState(false)

  const q = useQuery(async () => {
    const [events, deliveries, backups, assigns, checkouts, clientsCount, campaigns, fin, expenses] = await Promise.all([
      listEvents(),
      must<Delivery[]>(supabase.from('deliveries').select('*').neq('status', 'entregado').order('due_date', { ascending: true, nullsFirst: false })),
      must<Pick<Backup, 'event_id' | 'status'>[]>(supabase.from('backups').select('event_id, status')),
      must<{ event_id: string }[]>(supabase.from('assignments').select('event_id')),
      must<{ id: string }[]>(supabase.from('equipment_checkouts').select('id').is('returned_at', null)),
      supabase.from('clients').select('id', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      must<AdCampaign[]>(supabase.from('ad_campaigns').select('*').eq('status', 'activa')),
      isAdmin ? listEventFinance() : Promise.resolve(new Map<string, EventFinance>()),
      isAdmin ? must<Expense[]>(supabase.from('expenses').select('*').is('event_id', null)) : Promise.resolve([] as Expense[]),
    ])
    return { events, deliveries, backups, assigns, checkouts, clientsCount, campaigns, fin, expenses }
  }, [isAdmin])

  const d = useMemo(() => {
    if (!q.data) return null
    const today = todayISO()
    const month = today.slice(0, 7)
    const { events, deliveries, backups, assigns, fin, expenses } = q.data
    const evMap = new Map(events.map((e) => [e.id, e]))
    const active = events.filter((e) => e.status !== 'cancelado')
    const upcoming = active.filter((e) => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))
    const next30 = upcoming.filter((e) => daysUntil(e.event_date) <= 30)
    const thisMonth = active.filter((e) => e.event_date.startsWith(month))
    const teamCount = new Map<string, number>()
    for (const a of assigns) teamCount.set(a.event_id, (teamCount.get(a.event_id) ?? 0) + 1)
    const overdue = deliveries.filter((x) => x.due_date && x.due_date < today)
    const backed = new Set(backups.filter((b) => b.status === 'respaldado').map((b) => b.event_id))
    const pendingBackups = active.filter((e) => e.event_date < today && !backed.has(e.id))
    let receivable = 0
    let monthProfit = 0
    let totalProfit = 0
    const toCollect: { id: string; label: string; date: string; balance: number }[] = []
    for (const e of active) {
      const f = fin.get(e.id)
      if (!f) continue
      if (f.balance > 0) {
        receivable += num(f.balance)
        toCollect.push({ id: e.id, label: `${e.clients?.full_name ?? ''} · ${e.event_type}`, date: e.event_date, balance: num(f.balance) })
      }
      totalProfit += num(f.profit)
      if (e.event_date.startsWith(month)) monthProfit += num(f.profit)
    }
    const generalMonth = expenses.filter((x) => x.expense_date.startsWith(month)).reduce((s, x) => s + num(x.amount), 0)
    const generalAll = expenses.reduce((s, x) => s + num(x.amount), 0)
    toCollect.sort((a, b) => a.date.localeCompare(b.date))
    return {
      evMap,
      upcoming,
      next30,
      thisMonth,
      teamCount,
      overdue,
      pendingBackups,
      receivable,
      monthProfit: monthProfit - generalMonth,
      totalProfit: totalProfit - generalAll,
      toCollect,
    }
  }, [q.data])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data || !d) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const rawToday = format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })
  const todayLabel = rawToday.charAt(0).toUpperCase() + rawToday.slice(1)
  const hello = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-navy-900 to-navy-700 p-6 text-white shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-navy-100">{todayLabel}</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-white">
            {hello}, {profile?.full_name || profile?.username}
          </h1>
          <p className="mt-1 text-sm text-navy-100">Este es el resumen de STEFF para hoy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn bg-white text-navy-900 hover:bg-navy-50" onClick={() => setEventOpen(true)}>
            <Plus className="h-4 w-4" /> Evento
          </button>
          {isAdmin && (
            <Link className="btn bg-white/10 text-white hover:bg-white/20" to="/contratos/nuevo">
              <FileSignature className="h-4 w-4" /> Contrato
            </Link>
          )}
          <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={() => setClientOpen(true)}>
            <UserPlus className="h-4 w-4" /> Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Eventos este mes" value={d.thisMonth.length} icon={<CalendarDays className="h-5 w-5" />} onClick={() => navigate('/eventos/agenda')} />
        <StatCard label="Próximos 30 días" value={d.next30.length} icon={<CalendarCheck className="h-5 w-5" />} tone="blue" onClick={() => navigate('/eventos')} />
        <StatCard
          label="Entregas pendientes"
          value={q.data.deliveries.length}
          hint={d.overdue.length ? `${d.overdue.length} vencida(s)` : 'Ninguna vencida'}
          icon={<PackageCheck className="h-5 w-5" />}
          tone={d.overdue.length ? 'red' : 'amber'}
          onClick={() => navigate('/entregas')}
        />
        <StatCard
          label="Sin respaldo"
          value={d.pendingBackups.length}
          hint="Eventos realizados"
          icon={<HardDrive className="h-5 w-5" />}
          tone={d.pendingBackups.length ? 'amber' : 'green'}
          onClick={() => navigate('/eventos/respaldos')}
        />
        {isAdmin && (
          <>
            <StatCard label="Por cobrar" value={fmtMoney(d.receivable, true)} icon={<Wallet className="h-5 w-5" />} tone="amber" onClick={() => navigate('/finanzas')} />
            <StatCard label="Ganancia del mes" value={fmtMoney(d.monthProfit, true)} icon={<TrendingUp className="h-5 w-5" />} tone="green" onClick={() => navigate('/finanzas')} />
            <StatCard label="Ganancia acumulada" value={fmtMoney(d.totalProfit, true)} icon={<TrendingUp className="h-5 w-5" />} tone="green" onClick={() => navigate('/finanzas')} />
          </>
        )}
        <StatCard label="Clientes" value={q.data.clientsCount} icon={<Users className="h-5 w-5" />} onClick={() => navigate('/clientes')} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Próximos eventos" actions={<Link className="text-sm font-semibold text-navy-700 hover:underline" to="/eventos">Ver todos</Link>} bodyClass="p-0">
          {d.upcoming.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No hay eventos próximos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.upcoming.slice(0, 7).map((e) => {
                const days = daysUntil(e.event_date)
                const team = d.teamCount.get(e.id) ?? 0
                return (
                  <li key={e.id}>
                    <Link to={`/eventos/${e.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-slate-50">
                      <div className="w-14 shrink-0 rounded-lg bg-navy-50 py-1.5 text-center">
                        <p className="text-[10px] font-bold uppercase text-navy-600">{fmtDate(e.event_date, 'MMM')}</p>
                        <p className="font-display text-lg font-extrabold leading-none text-navy-900">{fmtDate(e.event_date, 'd')}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">
                          {e.event_type} · {e.clients?.full_name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {e.evento_place || e.misa_place || e.sesion_place || 'Sin lugar'} · {team ? `${team} en el equipo` : <span className="text-amber-700">Sin equipo asignado</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge tone={optionTone(EVENT_STATUS, e.status)}>{optionLabel(EVENT_STATUS, e.status)}</Badge>
                        <p className="mt-1 text-xs text-slate-400">{days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`}</p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="Entregas pendientes" actions={<Link className="text-sm font-semibold text-navy-700 hover:underline" to="/entregas">Ver todas</Link>} bodyClass="p-0">
          {q.data.deliveries.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Todo entregado. ¡Bien!</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {q.data.deliveries.slice(0, 7).map((x) => {
                const ev = d.evMap.get(x.event_id)
                const late = x.due_date ? daysUntil(x.due_date) < 0 : false
                return (
                  <li key={x.id}>
                    <Link to={`/eventos/${x.event_id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                      {late ? <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" /> : <Package className="h-5 w-5 shrink-0 text-slate-400" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">
                          {serviceLabel(x.service)} · {ev?.clients?.full_name ?? ''}
                        </p>
                        <p className={`text-xs ${late ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                          {x.due_date ? `Fecha límite: ${fmtDate(x.due_date)}` : 'Sin fecha límite'}
                        </p>
                      </div>
                      <Badge tone={optionTone(DELIVERY_STATUS, x.status)}>{optionLabel(DELIVERY_STATUS, x.status)}</Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {isAdmin && (
          <Card title="Pagos por cobrar" actions={<Link className="text-sm font-semibold text-navy-700 hover:underline" to="/finanzas">Finanzas</Link>} bodyClass="p-0">
            {d.toCollect.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No hay saldos pendientes.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.toCollect.slice(0, 7).map((c) => (
                  <li key={c.id}>
                    <Link to={`/eventos/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{c.label}</p>
                        <p className="text-xs text-slate-500">{fmtDate(c.date)}</p>
                      </div>
                      <p className="font-semibold text-amber-700">{fmtMoney(c.balance)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Más información">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link to="/eventos/entrega-equipo" className="rounded-lg border border-slate-200 p-4 transition hover:border-navy-300">
              <Package className="mb-2 h-5 w-5 text-navy-600" />
              <p className="text-sm font-semibold">Equipo entregado</p>
              <p className="text-xs text-slate-500">{q.data.checkouts.length} artículo(s) fuera</p>
            </Link>
            <Link to="/publicidad" className="rounded-lg border border-slate-200 p-4 transition hover:border-navy-300">
              <Megaphone className="mb-2 h-5 w-5 text-navy-600" />
              <p className="text-sm font-semibold">Publicidad activa</p>
              <p className="text-xs text-slate-500">
                {q.data.campaigns.length} campaña(s){isAdmin && q.data.campaigns.length ? ` · ${fmtMoney(q.data.campaigns.reduce((s, c) => s + num(c.spent), 0), true)} invertido` : ''}
              </p>
            </Link>
            <Link to="/eventos/equipo" className="rounded-lg border border-slate-200 p-4 transition hover:border-navy-300">
              <Users className="mb-2 h-5 w-5 text-navy-600" />
              <p className="text-sm font-semibold">Equipo humano</p>
              <p className="text-xs text-slate-500">Personal, estatus y pagos</p>
            </Link>
            <Link to="/contratos" className="rounded-lg border border-slate-200 p-4 transition hover:border-navy-300">
              <FileSignature className="mb-2 h-5 w-5 text-navy-600" />
              <p className="text-sm font-semibold">Contratos</p>
              <p className="text-xs text-slate-500">Crear, descargar y enviar</p>
            </Link>
          </div>
        </Card>
      </div>

      <EventForm open={eventOpen} onClose={() => setEventOpen(false)} onSaved={(ev) => navigate(`/eventos/${ev.id}`)} />
      <ClientForm open={clientOpen} onClose={() => setClientOpen(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
    </div>
  )
}
