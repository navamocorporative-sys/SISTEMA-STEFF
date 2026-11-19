import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput } from '../../components/ui'
import BackupForm from '../../components/forms/BackupForm'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { BACKUP_STATUS, DELIVERY_STATUS, optionLabel, optionTone, serviceLabel } from '../../lib/constants'
import { fmtDate, todayISO } from '../../lib/format'
import type { Backup, BackupStatus, Delivery } from '../../lib/types'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

interface BackupRow extends Backup {
  events: { id: string; project_number: string; event_type: string; event_date: string; status: string; clients: { full_name: string } | null } | null
}

interface EvLite {
  id: string
  project_number: string
  event_type: string
  event_date: string
  status: string
  clients: { full_name: string } | null
}

export default function BackupsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<BackupStatus | ''>('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Backup | null>(null)

  const q = useQuery(async () => {
    const [backups, deliveries, events] = await Promise.all([
      must<BackupRow[]>(
        supabase
          .from('backups')
          .select('*, events(id, project_number, event_type, event_date, status, clients(full_name))')
          .order('created_at', { ascending: false }),
      ),
      must<Pick<Delivery, 'event_id' | 'status'>[]>(supabase.from('deliveries').select('event_id, status')),
      must<EvLite[]>(
        supabase
          .from('events')
          .select('id, project_number, event_type, event_date, status, clients(full_name)')
          .lt('event_date', todayISO())
          .neq('status', 'cancelado')
          .order('event_date', { ascending: false }),
      ),
    ])
    return { backups, deliveries, events }
  }, [])

  const deliveryState = useMemo(() => {
    const m = new Map<string, string>()
    const byEvent = new Map<string, string[]>()
    for (const d of q.data?.deliveries ?? []) byEvent.set(d.event_id, [...(byEvent.get(d.event_id) ?? []), d.status])
    for (const [id, list] of byEvent) {
      m.set(id, list.every((s) => s === 'entregado') ? 'entregado' : list.includes('en_edicion') ? 'en_edicion' : list.find((s) => s !== 'entregado') ?? 'pendiente')
    }
    return m
  }, [q.data])

  const withoutBackup = useMemo(() => {
    const has = new Set((q.data?.backups ?? []).map((b) => b.event_id))
    return (q.data?.events ?? []).filter((e) => !has.has(e.id))
  }, [q.data])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    let list = q.data?.backups ?? []
    if (status) list = list.filter((b) => b.status === status)
    if (s)
      list = list.filter((b) =>
        `${b.events?.clients?.full_name ?? ''} ${b.events?.event_type ?? ''} ${b.events?.project_number ?? ''} ${b.folder_name} ${b.location}`.toLowerCase().includes(s),
      )
    return list
  }, [q.data, search, status])

  const remove = async (b: Backup) => {
    if (!(await confirm({ title: 'Eliminar respaldo', text: '¿Eliminar este registro de respaldo?' }))) return
    try {
      await must(supabase.from('backups').delete().eq('id', b.id).select('id'))
      toast.success('Eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div>
      <PageHeader
        title="Registro de respaldo y entrega de material"
        subtitle="Dónde quedó respaldado el material de cada evento y su estatus de entrega."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Registrar respaldo
          </button>
        }
      />

      {withoutBackup.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> {withoutBackup.length} evento(s) realizados sin respaldo registrado
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {withoutBackup.slice(0, 12).map((e) => (
              <Link key={e.id} to={`/eventos/${e.id}`} className="rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-900 shadow-sm hover:underline">
                {e.clients?.full_name ?? ''} · {e.event_type} · {fmtDate(e.event_date)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:justify-between">
          <select className="input sm:w-56" value={status} onChange={(e) => setStatus(e.target.value as BackupStatus | '')}>
            <option value="">Todos los respaldos</option>
            {BACKUP_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <SearchInput value={search} onChange={setSearch} placeholder="Cliente, carpeta, ubicación…" />
        </div>
        {q.loading && !q.data ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBlock message={q.error} onRetry={q.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Sin respaldos registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo de evento</th>
                  <th>Fecha</th>
                  <th>Material</th>
                  <th>Ubicación</th>
                  <th>Nombre / carpeta</th>
                  <th>Respaldo</th>
                  <th>Entrega</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const ds = deliveryState.get(b.event_id)
                  return (
                    <tr key={b.id}>
                      <td>
                        {b.events ? (
                          <Link to={`/eventos/${b.events.id}`} className="font-semibold text-navy-800 hover:underline">
                            {b.events.clients?.full_name ?? '—'}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{b.events?.event_type ?? '—'}</td>
                      <td className="whitespace-nowrap">{fmtDate(b.events?.event_date)}</td>
                      <td>{serviceLabel(b.service)}</td>
                      <td>{b.location || '—'}</td>
                      <td className="text-xs">
                        {b.folder_name || '—'}
                        {b.notes && <span className="block text-amber-700">{b.notes}</span>}
                      </td>
                      <td>
                        <Badge tone={optionTone(BACKUP_STATUS, b.status)}>{optionLabel(BACKUP_STATUS, b.status)}</Badge>
                      </td>
                      <td>{ds ? <Badge tone={optionTone(DELIVERY_STATUS, ds as Delivery['status'])}>{optionLabel(DELIVERY_STATUS, ds as Delivery['status'])}</Badge> : '—'}</td>
                      <td className="whitespace-nowrap text-right">
                        <button
                          className="btn-icon"
                          onClick={() => {
                            setEditing(b)
                            setOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="btn-icon hover:text-red-600" onClick={() => void remove(b)}>
                          <Trash2 className="h-4 w-4" />
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
      <BackupForm open={open} onClose={() => setOpen(false)} backup={editing} onSaved={() => void q.reload()} />
    </div>
  )
}
