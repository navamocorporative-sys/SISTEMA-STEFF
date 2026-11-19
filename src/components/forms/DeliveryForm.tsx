import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Field, Modal } from '../ui'
import Combobox from '../Combobox'
import { supabase, must } from '../../lib/supabase'
import { DELIVERY_METHODS, DELIVERY_STATUS, SERVICES } from '../../lib/constants'
import { fmtDate, todayISO } from '../../lib/format'
import { listEvents, listStaff, suggestedDueDate } from '../../lib/data'
import type { Delivery, DeliveryStatus, EventWithClient, Staff } from '../../lib/types'
import { useToast } from '../../context/ToastContext'

export default function DeliveryForm({
  open,
  onClose,
  event,
  delivery,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  event?: Pick<EventWithClient, 'id' | 'event_date' | 'delivery_type'> | null
  delivery: Delivery | null
  onSaved: () => void
}) {
  const toast = useToast()
  const [events, setEvents] = useState<EventWithClient[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [evId, setEvId] = useState<string | null>(null)
  const [service, setService] = useState('fotografia')
  const [status, setStatus] = useState<DeliveryStatus>('pendiente')
  const [editorId, setEditorId] = useState('')
  const [editDay, setEditDay] = useState('')
  const [due, setDue] = useState('')
  const [deliveredOn, setDeliveredOn] = useState('')
  const [method, setMethod] = useState('')
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEvId(delivery?.event_id ?? event?.id ?? null)
    setService(delivery?.service ?? 'fotografia')
    setStatus(delivery?.status ?? 'pendiente')
    setEditorId(delivery?.editor_id ?? '')
    setEditDay(delivery?.edit_day ?? '')
    setDue(delivery?.due_date ?? (event ? suggestedDueDate(event.event_date, event.delivery_type) : ''))
    setDeliveredOn(delivery?.delivered_on ?? '')
    setMethod(delivery?.method ?? '')
    setLink(delivery?.link ?? '')
    setNotes(delivery?.notes ?? '')
    listStaff()
      .then(setStaff)
      .catch((e) => toast.error(e))
    if (!event && !delivery) listEvents().then(setEvents).catch((e) => toast.error(e))
  }, [open, delivery, event, toast])

  const items = useMemo(
    () => events.map((e) => ({ id: e.id, label: `${e.clients?.full_name ?? 'Cliente'} · ${e.event_type}`, sub: `${e.project_number} · ${fmtDate(e.event_date)}` })),
    [events],
  )

  const onPickEvent = (id: string | null) => {
    setEvId(id)
    const ev = events.find((x) => x.id === id)
    if (ev && !due) setDue(suggestedDueDate(ev.event_date, ev.delivery_type))
  }

  const editors = staff.filter((s) => s.status !== 'inactivo')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!evId) return toast.error('Selecciona el evento.')
    setSaving(true)
    try {
      const payload = {
        event_id: evId,
        service,
        status,
        editor_id: editorId || null,
        edit_day: editDay,
        due_date: due || null,
        delivered_on: status === 'entregado' ? deliveredOn || todayISO() : deliveredOn || null,
        method,
        link: link.trim(),
        notes,
      }
      if (delivery) await must(supabase.from('deliveries').update(payload).eq('id', delivery.id).select('id').single())
      else await must(supabase.from('deliveries').insert(payload).select('id').single())
      toast.success('Entrega guardada')
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
      title={delivery ? 'Editar entrega' : 'Registrar entrega'}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="delivery-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="delivery-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!event && !delivery && (
          <Field label="Evento" required className="sm:col-span-2">
            <Combobox items={items} value={evId} onChange={onPickEvent} placeholder="Busca por cliente o proyecto…" />
          </Field>
        )}
        <Field label="Material">
          <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
            {SERVICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estatus">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus)}>
            {DELIVERY_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Editor">
          <select className="input" value={editorId} onChange={(e) => setEditorId(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {editors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Día de edición" hint="Ej. martes, miércoles / jueves">
          <input className="input" value={editDay} onChange={(e) => setEditDay(e.target.value)} />
        </Field>
        <Field label="Fecha límite de entrega">
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Fecha de entrega">
          <input className="input" type="date" value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} />
        </Field>
        <Field label="Medio de entrega">
          <input className="input" list="delivery-methods" value={method} onChange={(e) => setMethod(e.target.value)} />
          <datalist id="delivery-methods">
            {DELIVERY_METHODS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Enlace del material">
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
