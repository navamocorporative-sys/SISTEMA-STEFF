import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, Field, LoadingBlock, Modal } from '../../../components/ui'
import Combobox from '../../../components/Combobox'
import GuideModal from './GuideModal'
import { useQuery } from '../../../hooks/useQuery'
import { supabase, must } from '../../../lib/supabase'
import { listStaff } from '../../../lib/data'
import { STAFF_ROLES } from '../../../lib/constants'
import { fmtDateTime, fmtMoney } from '../../../lib/format'
import type { AssignmentWithStaff, EventWithClient, Staff } from '../../../lib/types'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { useConfirm } from '../../../context/ConfirmContext'

interface BusyRow {
  staff_id: string
  event_id: string
  events: { project_number: string; event_type: string } | null
}

export default function TeamTab({ event }: { event: EventWithClient }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssignmentWithStaff | null>(null)
  const [guideFor, setGuideFor] = useState<AssignmentWithStaff | null>(null)

  const q = useQuery(async () => {
    const [assignments, staff, busy] = await Promise.all([
      must<AssignmentWithStaff[]>(supabase.from('assignments').select('*, staff(id, full_name, phone, roles)').eq('event_id', event.id).order('created_at')),
      listStaff(),
      must<BusyRow[]>(
        supabase
          .from('assignments')
          .select('staff_id, event_id, events!inner(project_number, event_type, event_date)')
          .eq('events.event_date', event.event_date)
          .neq('event_id', event.id),
      ),
    ])
    return { assignments, staff, busy }
  }, [event.id, event.event_date])

  const busyMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const b of q.data?.busy ?? []) {
      const label = b.events ? `${b.events.event_type} (${b.events.project_number})` : 'otro evento'
      m.set(b.staff_id, [...(m.get(b.staff_id) ?? []), label])
    }
    return m
  }, [q.data])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const remove = async (a: AssignmentWithStaff) => {
    if (!(await confirm({ title: 'Quitar del evento', text: `¿Quitar a ${a.staff?.full_name ?? 'esta persona'} (${a.role}) del evento?` }))) return
    try {
      await must(supabase.from('assignments').delete().eq('id', a.id).select('id'))
      toast.success('Asignación eliminada')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Equipo asignado al evento"
        actions={
          isAdmin && (
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" /> Asignar persona
            </button>
          )
        }
        bodyClass="p-0"
      >
        {q.data.assignments.length === 0 ? (
          <EmptyState title="Aún no hay equipo asignado" text="Asigna a las personas que van a cubrir el evento y envíales su guía de trabajo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Función</th>
                  <th>Disponibilidad</th>
                  {isAdmin && <th className="text-right">Pago</th>}
                  <th>Guía de trabajo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.assignments.map((a) => {
                  const busy = busyMap.get(a.staff_id)
                  return (
                    <tr key={a.id}>
                      <td>
                        <p className="font-semibold">{a.staff?.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{a.staff?.phone}</p>
                      </td>
                      <td>{a.role}</td>
                      <td>
                        {busy ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" /> También en {busy.join(', ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Disponible
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="text-right">
                          {fmtMoney(a.payment)} {a.paid ? <Badge tone="green">Pagado</Badge> : <Badge tone="amber">Pendiente</Badge>}
                        </td>
                      )}
                      <td>
                        <button className="btn-secondary btn-sm" onClick={() => setGuideFor(a)}>
                          <BookOpen className="h-4 w-4" /> {a.guide ? 'Ver / enviar guía' : 'Crear guía'}
                        </button>
                        {a.guide_sent_at && <p className="mt-1 text-xs text-slate-400">Enviada: {fmtDateTime(a.guide_sent_at)}</p>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {isAdmin && (
                          <>
                            <button
                              className="btn-icon"
                              title="Editar"
                              onClick={() => {
                                setEditing(a)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button className="btn-icon hover:text-red-600" title="Quitar" onClick={() => void remove(a)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AssignmentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        eventId={event.id}
        assignment={editing}
        staff={q.data.staff}
        busyMap={busyMap}
        onSaved={() => void q.reload()}
      />

      {guideFor && (
        <GuideModal
          open={!!guideFor}
          onClose={() => setGuideFor(null)}
          assignment={guideFor}
          event={event}
          onSaved={() => void q.reload()}
        />
      )}
    </div>
  )
}

function AssignmentForm({
  open,
  onClose,
  eventId,
  assignment,
  staff,
  busyMap,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  eventId: string
  assignment: AssignmentWithStaff | null
  staff: Staff[]
  busyMap: Map<string, string[]>
  onSaved: () => void
}) {
  const toast = useToast()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [payment, setPayment] = useState('')
  const [paid, setPaid] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = open ? assignment?.id ?? 'new' : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setStaffId(assignment?.staff_id ?? null)
      setRole(assignment?.role ?? '')
      setPayment(assignment ? String(assignment.payment) : '')
      setPaid(assignment?.paid ?? false)
      setNotes(assignment?.notes ?? '')
    }
  }

  const items = useMemo(
    () =>
      staff
        .filter((s) => s.status !== 'inactivo' || s.id === assignment?.staff_id)
        .map((s) => ({
          id: s.id,
          label: s.full_name,
          sub: [s.roles.join(', '), busyMap.has(s.id) ? `⚠ Ocupado: ${busyMap.get(s.id)?.join(', ')}` : 'Disponible'].filter(Boolean).join(' · '),
        })),
    [staff, busyMap, assignment],
  )

  const selected = staff.find((s) => s.id === staffId)
  const roleOptions = Array.from(new Set([...(selected?.roles ?? []), ...STAFF_ROLES]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!staffId) return toast.error('Selecciona a la persona.')
    if (!role.trim()) return toast.error('Selecciona la función.')
    const v = Number(payment || 0)
    if (!Number.isFinite(v) || v < 0) return toast.error('El pago no es válido.')
    setSaving(true)
    try {
      const payload = { event_id: eventId, staff_id: staffId, role: role.trim(), payment: v, paid, paid_on: paid ? assignment?.paid_on ?? new Date().toISOString().slice(0, 10) : null, notes }
      if (assignment) await must(supabase.from('assignments').update(payload).eq('id', assignment.id).select('id').single())
      else await must(supabase.from('assignments').insert(payload).select('id').single())
      toast.success(assignment ? 'Asignación actualizada' : 'Persona asignada al evento')
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
      title={assignment ? 'Editar asignación' : 'Asignar persona al evento'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="assign-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="assign-form" onSubmit={submit} className="space-y-4">
        <Field label="Persona" required>
          <Combobox items={items} value={staffId} onChange={setStaffId} placeholder="Busca en tu equipo…" emptyText="No hay personas. Regístralas en Equipo humano." />
        </Field>
        {staffId && busyMap.has(staffId) && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Esta persona ya está asignada ese mismo día en: {busyMap.get(staffId)?.join(', ')}
          </p>
        )}
        <Field label="Función" required>
          <input className="input" list="roles-list" value={role} onChange={(e) => setRole(e.target.value)} />
          <datalist id="roles-list">
            {roleOptions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Pago a esta persona">
          <input className="input" type="number" min="0" step="0.01" value={payment} onChange={(e) => setPayment(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Ya se le pagó
        </label>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
