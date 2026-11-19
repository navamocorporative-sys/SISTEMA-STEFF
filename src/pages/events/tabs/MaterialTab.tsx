import { useState } from 'react'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock } from '../../../components/ui'
import BackupForm from '../../../components/forms/BackupForm'
import DeliveryForm from '../../../components/forms/DeliveryForm'
import { useQuery } from '../../../hooks/useQuery'
import { supabase, must } from '../../../lib/supabase'
import { BACKUP_STATUS, DELIVERY_STATUS, optionLabel, optionTone, serviceLabel } from '../../../lib/constants'
import { daysUntil, fmtDate } from '../../../lib/format'
import type { Backup, Delivery, EventWithClient, Staff } from '../../../lib/types'
import { useToast } from '../../../context/ToastContext'
import { useConfirm } from '../../../context/ConfirmContext'

export default function MaterialTab({ event }: { event: EventWithClient }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [bOpen, setBOpen] = useState(false)
  const [bEdit, setBEdit] = useState<Backup | null>(null)
  const [dOpen, setDOpen] = useState(false)
  const [dEdit, setDEdit] = useState<Delivery | null>(null)

  const q = useQuery(async () => {
    const [backups, deliveries, staff] = await Promise.all([
      must<Backup[]>(supabase.from('backups').select('*').eq('event_id', event.id).order('created_at')),
      must<Delivery[]>(supabase.from('deliveries').select('*').eq('event_id', event.id).order('created_at')),
      must<Pick<Staff, 'id' | 'full_name'>[]>(supabase.from('staff').select('id, full_name')),
    ])
    return { backups, deliveries, staff: new Map(staff.map((s) => [s.id, s.full_name])) }
  }, [event.id])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const staffNames = q.data.staff

  const del = async (table: 'backups' | 'deliveries', id: string) => {
    if (!(await confirm({ title: 'Eliminar registro', text: '¿Eliminar este registro?' }))) return
    try {
      await must(supabase.from(table).delete().eq('id', id).select('id'))
      toast.success('Eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card
        title="Registro de respaldo"
        actions={
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              setBEdit(null)
              setBOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Respaldo
          </button>
        }
        bodyClass="p-0"
      >
        {q.data.backups.length === 0 ? (
          <EmptyState title="Sin respaldos" text="Registra dónde quedó respaldado el material (disco duro, MAC, memoria…)." />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Material</th>
                <th>Ubicación / carpeta</th>
                <th>Estatus</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.backups.map((b) => (
                <tr key={b.id}>
                  <td className="font-medium">{serviceLabel(b.service)}</td>
                  <td>
                    <p>{b.location || '—'}</p>
                    <p className="text-xs text-slate-400">{b.folder_name}</p>
                    {b.notes && <p className="text-xs text-amber-700">{b.notes}</p>}
                  </td>
                  <td>
                    <Badge tone={optionTone(BACKUP_STATUS, b.status)}>{optionLabel(BACKUP_STATUS, b.status)}</Badge>
                    {b.backed_up_on && <p className="mt-1 text-xs text-slate-400">{fmtDate(b.backed_up_on)}</p>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      className="btn-icon"
                      onClick={() => {
                        setBEdit(b)
                        setBOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="btn-icon hover:text-red-600" onClick={() => void del('backups', b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Entrega de material"
        actions={
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              setDEdit(null)
              setDOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Entrega
          </button>
        }
        bodyClass="p-0"
      >
        {q.data.deliveries.length === 0 ? (
          <EmptyState title="Sin entregas registradas" text="Registra el estatus de edición y entrega de cada material." />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Material</th>
                <th>Edición</th>
                <th>Fecha límite</th>
                <th>Estatus</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.deliveries.map((d) => {
                const overdue = d.status !== 'entregado' && d.due_date && daysUntil(d.due_date) < 0
                return (
                  <tr key={d.id}>
                    <td className="font-medium">
                      {serviceLabel(d.service)}
                      {d.link && (
                        <a href={d.link} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-navy-600" title="Abrir enlace">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                    <td>
                      <p>{d.editor_id ? staffNames.get(d.editor_id) ?? '—' : '—'}</p>
                      {d.edit_day && <p className="text-xs text-slate-400">{d.edit_day}</p>}
                    </td>
                    <td className={overdue ? 'font-semibold text-red-600' : ''}>{fmtDate(d.due_date)}</td>
                    <td>
                      <Badge tone={optionTone(DELIVERY_STATUS, d.status)}>{optionLabel(DELIVERY_STATUS, d.status)}</Badge>
                      {d.delivered_on && <p className="mt-1 text-xs text-slate-400">{fmtDate(d.delivered_on)}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        className="btn-icon"
                        onClick={() => {
                          setDEdit(d)
                          setDOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-icon hover:text-red-600" onClick={() => void del('deliveries', d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <BackupForm open={bOpen} onClose={() => setBOpen(false)} eventId={event.id} backup={bEdit} onSaved={() => void q.reload()} />
      <DeliveryForm open={dOpen} onClose={() => setDOpen(false)} event={event} delivery={dEdit} onSaved={() => void q.reload()} />
    </div>
  )
}
