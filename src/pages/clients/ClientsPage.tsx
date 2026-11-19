import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Plus } from 'lucide-react'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput, StatCard } from '../../components/ui'
import ClientForm from '../../components/forms/ClientForm'
import WhatsAppBroadcast from '../../components/WhatsAppBroadcast'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { listClients } from '../../lib/data'
import { CLIENT_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { fmtDate, fmtMoney, num, seniority, todayISO } from '../../lib/format'
import type { ClientStatus, EventRow } from '../../lib/types'
import { useAuth } from '../../context/AuthContext'

type EvLite = Pick<EventRow, 'id' | 'client_id' | 'event_date' | 'event_type' | 'total_amount' | 'status'>

export default function ClientsPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ClientStatus | ''>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [waOpen, setWaOpen] = useState(false)

  const q = useQuery(async () => {
    const [clients, events] = await Promise.all([
      listClients(),
      must<EvLite[]>(supabase.from('events').select('id, client_id, event_date, event_type, total_amount, status')),
    ])
    return { clients, events }
  }, [])

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; total: number; last: EvLite | null; first: string | null; upcoming: boolean }>()
    const today = todayISO()
    for (const e of q.data?.events ?? []) {
      if (e.status === 'cancelado') continue
      const s = m.get(e.client_id) ?? { count: 0, total: 0, last: null, first: null, upcoming: false }
      s.count += 1
      s.total += num(e.total_amount)
      if (!s.last || e.event_date > s.last.event_date) s.last = e
      if (!s.first || e.event_date < s.first) s.first = e.event_date
      if (e.event_date >= today) s.upcoming = true
      m.set(e.client_id, s)
    }
    return m
  }, [q.data])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    let list = q.data?.clients ?? []
    if (status) list = list.filter((c) => c.status === status)
    if (s) list = list.filter((c) => `${c.full_name} ${c.phone} ${c.email} ${c.city} ${c.source}`.toLowerCase().includes(s))
    return list
  }, [q.data, search, status])

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const clients = q.data?.clients ?? []
  const recurring = [...stats.values()].filter((s) => s.count > 1).length
  const withUpcoming = [...stats.values()].filter((s) => s.upcoming).length
  const newThisMonth = clients.filter((c) => c.client_since.startsWith(todayISO().slice(0, 7))).length

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Base de datos para dar seguimiento, ver su historial y volver a venderles."
        actions={
          <>
            <button className="btn-whatsapp" disabled={selected.size === 0} onClick={() => setWaOpen(true)}>
              <MessageCircle className="h-4 w-4" /> WhatsApp ({selected.size})
            </button>
            <button className="btn-primary" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Nuevo cliente
            </button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes" value={clients.length} />
        <StatCard label="Nuevos este mes" value={newThisMonth} tone="blue" />
        <StatCard label="Con evento próximo" value={withUpcoming} tone="amber" />
        <StatCard label="Recurrentes (2+ eventos)" value={recurring} tone="green" />
      </div>
      <div className="card">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:justify-between">
          <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | '')}>
            <option value="">Todos los estatus</option>
            {CLIENT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <SearchInput value={search} onChange={setSearch} placeholder="Nombre, teléfono, correo…" />
        </div>
        {q.loading && !q.data ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBlock message={q.error} onRetry={q.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Sin clientes" text="Registra a tus clientes; también se crean desde “Nuevo evento”." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos" />
                  </th>
                  <th>Cliente</th>
                  <th>Estatus</th>
                  <th className="text-center">Eventos</th>
                  {isAdmin && <th className="text-right">Ha comprado</th>}
                  <th>Último evento</th>
                  <th>Con nosotros</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = stats.get(c.id)
                  const since = st?.first && st.first < c.client_since ? st.first : c.client_since
                  return (
                    <tr key={c.id} className="row-link" onClick={() => navigate(`/clientes/${c.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Seleccionar ${c.full_name}`} />
                      </td>
                      <td>
                        <p className="font-semibold">{c.full_name}</p>
                        <p className="text-xs text-slate-400">{c.phone || 'Sin teléfono'}</p>
                      </td>
                      <td>
                        <Badge tone={optionTone(CLIENT_STATUS, c.status)}>{optionLabel(CLIENT_STATUS, c.status)}</Badge>
                      </td>
                      <td className="text-center">{st?.count ?? 0}</td>
                      {isAdmin && <td className="text-right font-medium">{fmtMoney(st?.total ?? 0)}</td>}
                      <td className="text-sm">{st?.last ? `${st.last.event_type} · ${fmtDate(st.last.event_date)}` : '—'}</td>
                      <td className="text-sm text-slate-600">{seniority(since)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ClientForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
      <WhatsAppBroadcast open={waOpen} onClose={() => setWaOpen(false)} clients={clients.filter((c) => selected.has(c.id))} />
    </div>
  )
}
