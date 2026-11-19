import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Field, Modal } from '../ui'
import Combobox from '../Combobox'
import { supabase, must } from '../../lib/supabase'
import { BACKUP_LOCATIONS, BACKUP_SERVICES, BACKUP_STATUS } from '../../lib/constants'
import { fmtDate, todayISO } from '../../lib/format'
import { listEvents } from '../../lib/data'
import type { Backup, BackupStatus, EventWithClient } from '../../lib/types'
import { useToast } from '../../context/ToastContext'

export default function BackupForm({
  open,
  onClose,
  eventId,
  backup,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  eventId?: string | null
  backup: Backup | null
  onSaved: () => void
}) {
  const toast = useToast()
  const [events, setEvents] = useState<EventWithClient[]>([])
  const [evId, setEvId] = useState<string | null>(null)
  const [service, setService] = useState('general')
  const [location, setLocation] = useState('')
  const [folder, setFolder] = useState('')
  const [status, setStatus] = useState<BackupStatus>('pendiente')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEvId(backup?.event_id ?? eventId ?? null)
    setService(backup?.service ?? 'general')
    setLocation(backup?.location ?? '')
    setFolder(backup?.folder_name ?? '')
    setStatus(backup?.status ?? 'pendiente')
    setDate(backup?.backed_up_on ?? '')
    setNotes(backup?.notes ?? '')
    if (!eventId && !backup) listEvents().then(setEvents).catch((e) => toast.error(e))
  }, [open, backup, eventId, toast])

  const items = useMemo(
    () => events.map((e) => ({ id: e.id, label: `${e.clients?.full_name ?? 'Cliente'} · ${e.event_type}`, sub: `${e.project_number} · ${fmtDate(e.event_date)}` })),
    [events],
  )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!evId) return toast.error('Selecciona el evento.')
    setSaving(true)
    try {
      const payload = {
        event_id: evId,
        service,
        location,
        folder_name: folder,
        status,
        backed_up_on: status === 'respaldado' ? date || todayISO() : date || null,
        notes,
      }
      if (backup) await must(supabase.from('backups').update(payload).eq('id', backup.id).select('id').single())
      else await must(supabase.from('backups').insert(payload).select('id').single())
      toast.success('Respaldo guardado')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={backup ? 'Editar respaldo' : 'Registrar respaldo'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="backup-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="backup-form" onSubmit={submit} className="space-y-4">
        {!eventId && !backup && (
          <Field label="Evento" required>
            <Combobox items={items} value={evId} onChange={setEvId} placeholder="Busca por cliente o proyecto…" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Material">
            <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
              {BACKUP_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estatus del respaldo">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BackupStatus)}>
              {BACKUP_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Ubicación del respaldo" hint="Disco duro, MAC, memoria…">
          <input className="input" list="backup-locations" value={location} onChange={(e) => setLocation(e.target.value)} />
          <datalist id="backup-locations">
            {BACKUP_LOCATIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Nombre de la carpeta">
          <input className="input" value={folder} onChange={(e) => setFolder(e.target.value)} />
        </Field>
        <Field label="Fecha del respaldo">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notas" hint="Ej. falta video, eliminado de la memoria…">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
