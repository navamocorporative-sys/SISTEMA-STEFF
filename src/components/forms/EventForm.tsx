import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { Modal, Field, Checkbox } from '../ui'
import Combobox from '../Combobox'
import ClientForm from './ClientForm'
import { supabase, must } from '../../lib/supabase'
import { DELIVERY_TYPES, EVENT_STATUS, EVENT_TYPES, PAYMENT_METHODS, SERVICES } from '../../lib/constants'
import { projectNumberFromDate, todayISO } from '../../lib/format'
import { listClients, listStaff, suggestedDueDate, uniqueProjectNumber } from '../../lib/data'
import type { Client, DeliveryType, EventRow, EventStatus, Staff } from '../../lib/types'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'

type Slot = 'sesion' | 'misa' | 'evento'
const SLOTS: { key: Slot; label: string }[] = [
  { key: 'sesion', label: 'Sesión' },
  { key: 'misa', label: 'Misa' },
  { key: 'evento', label: 'Evento' },
]

interface FormState {
  client_id: string | null
  event_type: string
  main_names: string
  event_date: string
  project_number: string
  status: EventStatus
  package: string
  services: string[]
  total_amount: string
  seller_id: string | null
  address: string
  sesion_place: string
  sesion_maps_url: string
  sesion_start: string
  sesion_end: string
  misa_place: string
  misa_maps_url: string
  misa_start: string
  misa_end: string
  evento_place: string
  evento_maps_url: string
  evento_start: string
  evento_end: string
  delivery_type: DeliveryType
  print_service: string
  notes: string
  advance_amount: string
  advance_date: string
  advance_method: string
}

const key = (slot: Slot, x: 'place' | 'maps_url' | 'start' | 'end') => `${slot}_${x}` as const

const t5 = (t: string | null) => (t ? t.slice(0, 5) : '')

function fromEvent(e: EventRow | null | undefined, clientId?: string | null): FormState {
  return {
    client_id: e?.client_id ?? clientId ?? null,
    event_type: e?.event_type ?? '',
    main_names: e?.main_names ?? '',
    event_date: e?.event_date ?? '',
    project_number: e?.project_number ?? '',
    status: e?.status ?? 'confirmado',
    package: e?.package ?? '',
    services: e?.services ?? [],
    total_amount: e ? String(e.total_amount ?? 0) : '',
    seller_id: e?.seller_id ?? null,
    address: e?.address ?? '',
    sesion_place: e?.sesion_place ?? '',
    sesion_maps_url: e?.sesion_maps_url ?? '',
    sesion_start: t5(e?.sesion_start ?? null),
    sesion_end: t5(e?.sesion_end ?? null),
    misa_place: e?.misa_place ?? '',
    misa_maps_url: e?.misa_maps_url ?? '',
    misa_start: t5(e?.misa_start ?? null),
    misa_end: t5(e?.misa_end ?? null),
    evento_place: e?.evento_place ?? '',
    evento_maps_url: e?.evento_maps_url ?? '',
    evento_start: t5(e?.evento_start ?? null),
    evento_end: t5(e?.evento_end ?? null),
    delivery_type: e?.delivery_type ?? 'normal',
    print_service: e?.print_service ?? '',
    notes: e?.notes ?? '',
    advance_amount: '',
    advance_date: todayISO(),
    advance_method: 'Efectivo',
  }
}

export default function EventForm({
  open,
  onClose,
  event,
  defaultClientId,
  defaultDate,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  event?: EventRow | null
  defaultClientId?: string | null
  defaultDate?: string
  onSaved: (e: EventRow) => void
}) {
  const toast = useToast()
  const { isAdmin } = useAuth()
  const [f, setF] = useState<FormState>(fromEvent(null))
  const [clients, setClients] = useState<Client[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [saving, setSaving] = useState(false)
  const [pnTouched, setPnTouched] = useState(false)
  const [clientFormOpen, setClientFormOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const base = fromEvent(event, defaultClientId)
    if (!event && defaultDate) {
      base.event_date = defaultDate
      base.project_number = projectNumberFromDate(defaultDate)
    }
    setF(base)
    setPnTouched(!!event)
    Promise.all([listClients(), listStaff()])
      .then(([c, s]) => {
        setClients(c)
        setStaff(s)
      })
      .catch((e) => toast.error(e))
  }, [open, event, defaultClientId, defaultDate, toast])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  const clientItems = useMemo(() => clients.map((c) => ({ id: c.id, label: c.full_name, sub: c.phone })), [clients])
  const sellers = useMemo(() => staff.filter((s) => s.status !== 'inactivo'), [staff])

  const onDate = (d: string) => {
    setF((p) => ({ ...p, event_date: d, project_number: pnTouched ? p.project_number : projectNumberFromDate(d) }))
  }

  const toggleService = (v: string, on: boolean) =>
    setF((p) => ({ ...p, services: on ? Array.from(new Set([...p.services, v])) : p.services.filter((s) => s !== v) }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.client_id) return toast.error('Selecciona o registra al cliente.')
    if (!f.event_type.trim()) return toast.error('Escribe el tipo de evento.')
    if (!f.event_date) return toast.error('Selecciona la fecha del evento.')
    const total = Number(f.total_amount || 0)
    if (!Number.isFinite(total) || total < 0) return toast.error('El costo del servicio no es válido.')
    const advance = Number(f.advance_amount || 0)
    if (!Number.isFinite(advance) || advance < 0) return toast.error('El anticipo no es válido.')

    setSaving(true)
    try {
      const pnBase = (f.project_number || projectNumberFromDate(f.event_date)).trim()
      const project_number = event && event.project_number === pnBase ? pnBase : await uniqueProjectNumber(pnBase, event?.id)
      const tn = (v: string) => (v ? v : null)
      const payload = {
        client_id: f.client_id,
        event_type: f.event_type.trim(),
        main_names: f.main_names.trim(),
        event_date: f.event_date,
        project_number,
        status: f.status,
        package: f.package,
        services: f.services,
        total_amount: total,
        seller_id: f.seller_id,
        address: f.address,
        sesion_place: f.sesion_place,
        sesion_maps_url: f.sesion_maps_url.trim(),
        sesion_start: tn(f.sesion_start),
        sesion_end: tn(f.sesion_end),
        misa_place: f.misa_place,
        misa_maps_url: f.misa_maps_url.trim(),
        misa_start: tn(f.misa_start),
        misa_end: tn(f.misa_end),
        evento_place: f.evento_place,
        evento_maps_url: f.evento_maps_url.trim(),
        evento_start: tn(f.evento_start),
        evento_end: tn(f.evento_end),
        delivery_type: f.delivery_type,
        print_service: f.print_service,
        notes: f.notes,
      }
      let saved: EventRow
      if (event) {
        saved = await must<EventRow>(supabase.from('events').update(payload).eq('id', event.id).select().single())
      } else {
        saved = await must<EventRow>(supabase.from('events').insert(payload).select().single())
        // Entregas pendientes automáticas por cada servicio contratado
        const deliverable = f.services.filter((s) => s !== 'impresion')
        if (deliverable.length) {
          const due = suggestedDueDate(f.event_date, f.delivery_type)
          const { error } = await supabase
            .from('deliveries')
            .insert(deliverable.map((s) => ({ event_id: saved.id, service: s, status: 'pendiente', due_date: due || null })))
          if (error) toast.error('El evento se guardó, pero no se pudieron crear las entregas pendientes.')
        }
        if (isAdmin && advance > 0) {
          const { error } = await supabase.from('event_payments').insert({
            event_id: saved.id,
            concept: 'anticipo',
            amount: advance,
            paid_on: f.advance_date || todayISO(),
            method: f.advance_method,
          })
          if (error) toast.error('El evento se guardó, pero no se pudo registrar el anticipo.')
        }
      }
      toast.success(event ? 'Evento actualizado' : `Evento registrado · Proyecto ${saved.project_number}`)
      onSaved(saved)
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={event ? `Editar evento · ${event.project_number}` : 'Nuevo evento'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" form="event-form" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar evento'}
            </button>
          </>
        }
      >
        <form id="event-form" onSubmit={submit} className="space-y-6">
          <section>
            <h3 className="section-title mb-3">Cliente</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Cliente" required className="flex-1">
                <Combobox items={clientItems} value={f.client_id} onChange={(id) => set('client_id', id)} placeholder="Busca por nombre o teléfono…" />
              </Field>
              <button type="button" className="btn-secondary" onClick={() => setClientFormOpen(true)}>
                <UserPlus className="h-4 w-4" /> Nuevo cliente
              </button>
            </div>
          </section>

          <section>
            <h3 className="section-title mb-3">Datos del evento</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Tipo de evento" required>
                <input className="input" list="event-types" value={f.event_type} onChange={(e) => set('event_type', e.target.value)} />
                <datalist id="event-types">
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Field>
              <Field label="Fecha del evento" required>
                <input className="input" type="date" value={f.event_date} onChange={(e) => onDate(e.target.value)} />
              </Field>
              <Field label="Número de proyecto" hint="Se genera con la fecha (AAMMDD)">
                <input
                  className="input"
                  value={f.project_number}
                  onChange={(e) => {
                    setPnTouched(true)
                    set('project_number', e.target.value)
                  }}
                />
              </Field>
              <Field label="Nombres principales" hint="Festejado(a)s / novios" className="sm:col-span-2">
                <input className="input" value={f.main_names} onChange={(e) => set('main_names', e.target.value)} />
              </Field>
              <Field label="Estatus">
                <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as EventStatus)}>
                  {EVENT_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dirección (para contrato)" className="sm:col-span-3">
                <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="section-title mb-3">Horarios y lugares</h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {SLOTS.map((s) => (
                <div key={s.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <p className="mb-2 text-sm font-bold text-navy-900">{s.label}</p>
                  <div className="space-y-2">
                    <input
                      className="input"
                      placeholder="Lugar"
                      value={f[key(s.key, 'place')]}
                      onChange={(e) => set(key(s.key, 'place'), e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="Ubicación (enlace de Google Maps)"
                      value={f[key(s.key, 'maps_url')]}
                      onChange={(e) => set(key(s.key, 'maps_url'), e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-slate-500">
                        Inicio
                        <input className="input mt-0.5" type="time" value={f[key(s.key, 'start')]} onChange={(e) => set(key(s.key, 'start'), e.target.value)} />
                      </label>
                      <label className="text-xs text-slate-500">
                        Fin
                        <input className="input mt-0.5" type="time" value={f[key(s.key, 'end')]} onChange={(e) => set(key(s.key, 'end'), e.target.value)} />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-title mb-3">Venta y servicio</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <span className="label">Servicios contratados</span>
                <div className="flex flex-wrap gap-4">
                  {SERVICES.map((s) => (
                    <Checkbox key={s.value} checked={f.services.includes(s.value)} onChange={(on) => toggleService(s.value, on)} label={s.label} />
                  ))}
                </div>
              </div>
              <Field label="Paquete" className="sm:col-span-3">
                <textarea className="input min-h-[70px]" value={f.package} onChange={(e) => set('package', e.target.value)} placeholder="Descripción del paquete contratado" />
              </Field>
              <Field label="Costo del servicio (total)">
                <input className="input" type="number" min="0" step="0.01" value={f.total_amount} onChange={(e) => set('total_amount', e.target.value)} />
              </Field>
              <Field label="Vendedor">
                <select className="input" value={f.seller_id ?? ''} onChange={(e) => set('seller_id', e.target.value || null)}>
                  <option value="">— Sin asignar —</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tiempo de entrega">
                <select className="input" value={f.delivery_type} onChange={(e) => set('delivery_type', e.target.value as DeliveryType)}>
                  {DELIVERY_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Servicio de impresión digital" className="sm:col-span-3">
                <input className="input" value={f.print_service} onChange={(e) => set('print_service', e.target.value)} placeholder="Ej. ampliación, álbum, marco…" />
              </Field>
              {!event && isAdmin && (
                <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-navy-200 bg-navy-50/40 p-3 sm:col-span-3 sm:grid-cols-3">
                  <Field label="Anticipo recibido (opcional)">
                    <input className="input" type="number" min="0" step="0.01" value={f.advance_amount} onChange={(e) => set('advance_amount', e.target.value)} />
                  </Field>
                  <Field label="Fecha del anticipo">
                    <input className="input" type="date" value={f.advance_date} onChange={(e) => set('advance_date', e.target.value)} />
                  </Field>
                  <Field label="Forma de pago">
                    <select className="input" value={f.advance_method} onChange={(e) => set('advance_method', e.target.value)}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              <Field label="Notas" className="sm:col-span-3">
                <textarea className="input min-h-[70px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
            {!event && <p className="mt-3 text-xs text-slate-400">Al guardar se crean automáticamente las entregas pendientes de cada servicio (fotografía, video, dron).</p>}
          </section>
        </form>
      </Modal>

      <ClientForm
        open={clientFormOpen}
        onClose={() => setClientFormOpen(false)}
        onSaved={(c) => {
          setClients((l) => [...l, c].sort((a, b) => a.full_name.localeCompare(b.full_name)))
          set('client_id', c.id)
        }}
      />
    </>
  )
}
