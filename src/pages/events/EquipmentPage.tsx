import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, Field, LoadingBlock, Modal, PageHeader, SearchInput } from '../../components/ui'
import Combobox from '../../components/Combobox'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { listEvents, listStaff } from '../../lib/data'
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { daysUntil, fmtDate, fmtDateTime } from '../../lib/format'
import type { Equipment, EquipmentCheckout, EquipmentStatus, EventWithClient, Staff } from '../../lib/types'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

export default function EquipmentPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [eqOpen, setEqOpen] = useState(false)
  const [eqEdit, setEqEdit] = useState<Equipment | null>(null)
  const [outFor, setOutFor] = useState<Equipment | null>(null)
  const [returning, setReturning] = useState<EquipmentCheckout | null>(null)
  const [historyFor, setHistoryFor] = useState<Equipment | null>(null)

  const q = useQuery(async () => {
    const [equipment, checkouts, staff, events] = await Promise.all([
      must<Equipment[]>(supabase.from('equipment').select('*').order('name')),
      must<EquipmentCheckout[]>(supabase.from('equipment_checkouts').select('*').order('out_at', { ascending: false })),
      listStaff(),
      listEvents(),
    ])
    return { equipment, checkouts, staff, events }
  }, [])

  const staffName = useMemo(() => new Map((q.data?.staff ?? []).map((s) => [s.id, s.full_name])), [q.data])
  const eventLabel = useMemo(
    () => new Map((q.data?.events ?? []).map((e) => [e.id, `${e.event_type} · ${e.clients?.full_name ?? ''} (${e.project_number})`])),
    [q.data],
  )
  const eqName = useMemo(() => new Map((q.data?.equipment ?? []).map((e) => [e.id, e.name])), [q.data])
  const active = (q.data?.checkouts ?? []).filter((c) => !c.returned_at)
  const activeByEq = new Map(active.map((c) => [c.equipment_id, c]))

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    const list = q.data?.equipment ?? []
    return s ? list.filter((e) => `${e.name} ${e.category} ${e.brand} ${e.model} ${e.serial}`.toLowerCase().includes(s)) : list
  }, [q.data, search])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const remove = async (e: Equipment) => {
    if (!(await confirm({ title: 'Eliminar equipo', text: `¿Eliminar "${e.name}" y su historial de entregas?` }))) return
    try {
      await must(supabase.from('equipment').delete().eq('id', e.id).select('id'))
      toast.success('Equipo eliminado')
      void q.reload()
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <div>
      <PageHeader
        title="Entrega de equipo"
        subtitle="Inventario de equipo y registro de salidas y devoluciones por evento."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEqEdit(null)
              setEqOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Agregar equipo
          </button>
        }
      />

      <Card title={`Equipo entregado (${active.length})`} className="mb-6" bodyClass="p-0">
        {active.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No hay equipo fuera en este momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Entregado a</th>
                  <th>Evento</th>
                  <th>Salida</th>
                  <th>Devolver</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((c) => {
                  const late = c.due_back && daysUntil(c.due_back) < 0
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold">{eqName.get(c.equipment_id) ?? '—'}</td>
                      <td>{c.staff_id ? staffName.get(c.staff_id) ?? '—' : '—'}</td>
                      <td className="text-xs">{c.event_id ? eventLabel.get(c.event_id) ?? '—' : '—'}</td>
                      <td className="text-xs">{fmtDateTime(c.out_at)}</td>
                      <td className={late ? 'font-semibold text-red-600' : ''}>{fmtDate(c.due_back)}</td>
                      <td className="text-right">
                        <button className="btn-secondary btn-sm" onClick={() => setReturning(c)}>
                          <ArrowDownToLine className="h-4 w-4" /> Recibir
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="card">
        <div className="border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar equipo…" />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Sin equipo registrado" text="Agrega cámaras, lentes, drones, iluminación, audio…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Categoría</th>
                  <th>Marca / modelo</th>
                  <th>Serie</th>
                  <th>Estatus</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="font-semibold">{e.name}</td>
                    <td>{e.category || '—'}</td>
                    <td>{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="font-mono text-xs">{e.serial || '—'}</td>
                    <td>
                      <Badge tone={optionTone(EQUIPMENT_STATUS, e.status)}>{optionLabel(EQUIPMENT_STATUS, e.status)}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {activeByEq.has(e.id) ? (
                        <button className="btn-secondary btn-sm" onClick={() => setReturning(activeByEq.get(e.id) ?? null)}>
                          <ArrowDownToLine className="h-4 w-4" /> Recibir
                        </button>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => setOutFor(e)} disabled={e.status === 'baja' || e.status === 'mantenimiento'}>
                          <ArrowUpFromLine className="h-4 w-4" /> Entregar
                        </button>
                      )}
                      <button className="btn-icon ml-1" onClick={() => setHistoryFor(e)} title="Historial">
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => {
                          setEqEdit(e)
                          setEqOpen(true)
                        }}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-icon hover:text-red-600" onClick={() => void remove(e)} title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EquipmentForm open={eqOpen} onClose={() => setEqOpen(false)} equipment={eqEdit} onSaved={() => void q.reload()} />
      {outFor && <CheckoutForm equipment={outFor} staff={q.data.staff} events={q.data.events} onClose={() => setOutFor(null)} onSaved={() => void q.reload()} />}
      {returning && <ReturnForm checkout={returning} name={eqName.get(returning.equipment_id) ?? ''} onClose={() => setReturning(null)} onSaved={() => void q.reload()} />}
      {historyFor && (
        <Modal open onClose={() => setHistoryFor(null)} title={`Historial · ${historyFor.name}`} size="lg">
          {(() => {
            const list = q.data.checkouts.filter((c) => c.equipment_id === historyFor.id)
            if (!list.length) return <p className="text-sm text-slate-500">Sin movimientos.</p>
            return (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Salida</th>
                    <th>Persona</th>
                    <th>Evento</th>
                    <th>Devolución</th>
                    <th>Condición</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td className="text-xs">{fmtDateTime(c.out_at)}</td>
                      <td>{c.staff_id ? staffName.get(c.staff_id) ?? '—' : '—'}</td>
                      <td className="text-xs">{c.event_id ? eventLabel.get(c.event_id) ?? '—' : '—'}</td>
                      <td className="text-xs">{c.returned_at ? fmtDateTime(c.returned_at) : <Badge tone="blue">Fuera</Badge>}</td>
                      <td className="text-xs">
                        {c.condition_out && <p>Salida: {c.condition_out}</p>}
                        {c.condition_in && <p>Regreso: {c.condition_in}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}

function EquipmentForm({ open, onClose, equipment, onSaved }: { open: boolean; onClose: () => void; equipment: Equipment | null; onSaved: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')
  const [status, setStatus] = useState<EquipmentStatus>('disponible')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? equipment?.id ?? 'new' : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setName(equipment?.name ?? '')
      setCategory(equipment?.category ?? '')
      setBrand(equipment?.brand ?? '')
      setModel(equipment?.model ?? '')
      setSerial(equipment?.serial ?? '')
      setStatus(equipment?.status ?? 'disponible')
      setNotes(equipment?.notes ?? '')
    }
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Escribe el nombre del equipo.')
    setSaving(true)
    try {
      const payload = { name: name.trim(), category, brand, model, serial, status, notes }
      if (equipment) await must(supabase.from('equipment').update(payload).eq('id', equipment.id).select('id').single())
      else await must(supabase.from('equipment').insert(payload).select('id').single())
      toast.success('Equipo guardado')
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
      title={equipment ? 'Editar equipo' : 'Agregar equipo'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="eq-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="eq-form" onSubmit={submit} className="space-y-4">
        <Field label="Nombre" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Categoría">
          <input className="input" list="eq-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="eq-cats">
            {EQUIPMENT_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <Field label="Modelo">
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
        </div>
        <Field label="Número de serie">
          <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} />
        </Field>
        <Field label="Estatus">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>
            {EQUIPMENT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

function CheckoutForm({
  equipment,
  staff,
  events,
  onClose,
  onSaved,
}: {
  equipment: Equipment
  staff: Staff[]
  events: EventWithClient[]
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [due, setDue] = useState('')
  const [cond, setCond] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const staffItems = staff.filter((s) => s.status !== 'inactivo').map((s) => ({ id: s.id, label: s.full_name, sub: s.roles.join(', ') }))
  const eventItems = events.map((e) => ({ id: e.id, label: `${e.event_type} · ${e.clients?.full_name ?? ''}`, sub: `${e.project_number} · ${fmtDate(e.event_date)}` }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!staffId) return toast.error('Selecciona a quién se entrega.')
    setSaving(true)
    try {
      await must(
        supabase
          .from('equipment_checkouts')
          .insert({ equipment_id: equipment.id, staff_id: staffId, event_id: eventId, due_back: due || null, condition_out: cond, notes })
          .select('id')
          .single(),
      )
      await must(supabase.from('equipment').update({ status: 'en_uso' }).eq('id', equipment.id).select('id').single())
      toast.success('Salida registrada')
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
      open
      onClose={onClose}
      title={`Entregar · ${equipment.name}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="out-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar salida'}
          </button>
        </>
      }
    >
      <form id="out-form" onSubmit={submit} className="space-y-4">
        <Field label="Entregado a" required>
          <Combobox items={staffItems} value={staffId} onChange={setStaffId} />
        </Field>
        <Field label="Evento (opcional)">
          <Combobox items={eventItems} value={eventId} onChange={setEventId} />
        </Field>
        <Field label="Fecha de devolución">
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Condición al salir">
          <input className="input" value={cond} onChange={(e) => setCond(e.target.value)} placeholder="Ej. completo, con 2 baterías" />
        </Field>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

function ReturnForm({ checkout, name, onClose, onSaved }: { checkout: EquipmentCheckout; name: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [cond, setCond] = useState('')
  const [status, setStatus] = useState<EquipmentStatus>('disponible')
  const [saving, setSaving] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await must(supabase.from('equipment_checkouts').update({ returned_at: new Date().toISOString(), condition_in: cond }).eq('id', checkout.id).select('id').single())
      await must(supabase.from('equipment').update({ status }).eq('id', checkout.equipment_id).select('id').single())
      toast.success('Devolución registrada')
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
      open
      onClose={onClose}
      title={`Recibir · ${name}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="ret-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar devolución'}
          </button>
        </>
      }
    >
      <form id="ret-form" onSubmit={submit} className="space-y-4">
        <Field label="Condición al regresar">
          <input className="input" value={cond} onChange={(e) => setCond(e.target.value)} placeholder="Ej. sin daños" />
        </Field>
        <Field label="Estatus del equipo">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>
            {EQUIPMENT_STATUS.filter((s) => s.value !== 'en_uso').map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  )
}
