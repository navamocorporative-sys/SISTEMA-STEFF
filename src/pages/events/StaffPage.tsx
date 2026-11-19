import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ImagePlus, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Avatar, Badge, Checkbox, EmptyState, ErrorBlock, Field, InfoRow, LoadingBlock, Modal, PageHeader, SearchInput } from '../../components/ui'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { listStaff } from '../../lib/data'
import { STAFF_ROLES, STAFF_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { fmtDate, fmtMoney, num } from '../../lib/format'
import { compressImage, publicUrl, removeFile, uploadFile, validateImage } from '../../lib/storage'
import { openWhatsApp } from '../../lib/whatsapp'
import type { Assignment, Staff, StaffStatus } from '../../lib/types'
import { useAuth, useSettings } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

interface StaffAssign extends Assignment {
  events: { id: string; project_number: string; event_type: string; event_date: string } | null
}

export default function StaffPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [viewing, setViewing] = useState<Staff | null>(null)

  const q = useQuery(async () => {
    const [staff, assigns] = await Promise.all([
      listStaff(),
      must<StaffAssign[]>(supabase.from('assignments').select('*, events(id, project_number, event_type, event_date)')),
    ])
    return { staff, assigns }
  }, [])

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; unpaid: number }>()
    for (const a of q.data?.assigns ?? []) {
      const s = m.get(a.staff_id) ?? { count: 0, unpaid: 0 }
      s.count += 1
      if (!a.paid) s.unpaid += num(a.payment)
      m.set(a.staff_id, s)
    }
    return m
  }, [q.data])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    const list = q.data?.staff ?? []
    return s ? list.filter((p) => `${p.full_name} ${p.roles.join(' ')} ${p.phone}`.toLowerCase().includes(s)) : list
  }, [q.data, search])

  const remove = async (s: Staff) => {
    if (!(await confirm({ title: 'Eliminar persona', text: `¿Eliminar a ${s.full_name}? Si tiene eventos asignados no se podrá eliminar; en ese caso cámbiale el estatus a “Inactivo”.` }))) return
    try {
      await must(supabase.from('staff').delete().eq('id', s.id).select('id'))
      await removeFile('media', s.photo_path)
      toast.success('Persona eliminada')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div>
      <PageHeader
        title="Registro de equipo humano"
        subtitle="Información completa del personal y su estatus."
        actions={
          isAdmin && (
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" /> Nueva persona
            </button>
          )
        }
      />
      <div className="card">
        <div className="border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Nombre, función, teléfono…" />
        </div>
        {q.loading && !q.data ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBlock message={q.error} onRetry={q.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Sin personal registrado" text="Registra a fotógrafos, videógrafos, pilotos de dron, editores y vendedores." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Funciones</th>
                  <th>Teléfono</th>
                  <th className="text-center">Eventos</th>
                  {isAdmin && <th className="text-right">Por pagar</th>}
                  <th>Estatus</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const st = stats.get(s.id)
                  return (
                    <tr key={s.id} className="row-link" onClick={() => setViewing(s)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.full_name} src={s.photo_path ? publicUrl(s.photo_path) : null} size="sm" />
                          <span className="font-semibold">{s.full_name}</span>
                        </div>
                      </td>
                      <td className="text-xs text-slate-600">{s.roles.join(', ') || '—'}</td>
                      <td>{s.phone || '—'}</td>
                      <td className="text-center">{st?.count ?? 0}</td>
                      {isAdmin && <td className={`text-right ${st && st.unpaid > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{fmtMoney(st?.unpaid ?? 0)}</td>}
                      <td>
                        <Badge tone={optionTone(STAFF_STATUS, s.status)}>{optionLabel(STAFF_STATUS, s.status)}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        {isAdmin && (
                          <>
                            <button
                              className="btn-icon"
                              onClick={() => {
                                setEditing(s)
                                setFormOpen(true)
                              }}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button className="btn-icon hover:text-red-600" onClick={() => void remove(s)} title="Eliminar">
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
      </div>

      <StaffForm open={formOpen} onClose={() => setFormOpen(false)} staff={editing} onSaved={() => void q.reload()} />
      {viewing && (
        <StaffDetail
          staff={viewing}
          assigns={(q.data?.assigns ?? []).filter((a) => a.staff_id === viewing.id)}
          onClose={() => setViewing(null)}
          showMoney={isAdmin}
        />
      )}
    </div>
  )
}

function StaffDetail({ staff, assigns, onClose, showMoney }: { staff: Staff; assigns: StaffAssign[]; onClose: () => void; showMoney: boolean }) {
  const settings = useSettings()
  const sorted = [...assigns].sort((a, b) => (b.events?.event_date ?? '').localeCompare(a.events?.event_date ?? ''))
  return (
    <Modal open onClose={onClose} title={staff.full_name} size="lg">
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="md:w-64">
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar name={staff.full_name} src={staff.photo_path ? publicUrl(staff.photo_path) : null} size="lg" />
            <Badge tone={optionTone(STAFF_STATUS, staff.status)}>{optionLabel(STAFF_STATUS, staff.status)}</Badge>
            {staff.phone && (
              <button className="btn-whatsapp btn-sm" onClick={() => openWhatsApp(staff.phone, `Hola ${staff.full_name}, `, settings.whatsapp_country_code)}>
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
            )}
          </div>
        </div>
        <dl className="flex-1 divide-y divide-slate-100">
          <InfoRow label="Funciones">{staff.roles.join(', ')}</InfoRow>
          <InfoRow label="Teléfono">{staff.phone}</InfoRow>
          <InfoRow label="Correo">{staff.email}</InfoRow>
          <InfoRow label="Dirección">{staff.address}</InfoRow>
          <InfoRow label="Nacimiento">{staff.birth_date ? fmtDate(staff.birth_date) : ''}</InfoRow>
          <InfoRow label="Contacto de emergencia">{[staff.emergency_contact, staff.emergency_phone].filter(Boolean).join(' · ')}</InfoRow>
          {showMoney && <InfoRow label="Banco / cuenta">{[staff.bank_name, staff.bank_account].filter(Boolean).join(' · ')}</InfoRow>}
          {showMoney && <InfoRow label="Tarifas">{staff.rate_notes}</InfoRow>}
          <InfoRow label="Equipo propio">{staff.equipment_notes}</InfoRow>
          <InfoRow label="Notas">{staff.notes}</InfoRow>
        </dl>
      </div>
      <h3 className="section-title mb-2 mt-6">Eventos cubiertos ({sorted.length})</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no ha sido asignado a eventos.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Evento</th>
                <th>Función</th>
                {showMoney && <th className="text-right">Pago</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDate(a.events?.event_date)}</td>
                  <td>
                    {a.events ? (
                      <Link className="font-medium text-navy-700 hover:underline" to={`/eventos/${a.events.id}`}>
                        {a.events.event_type} · {a.events.project_number}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{a.role}</td>
                  {showMoney && (
                    <td className="text-right">
                      {fmtMoney(a.payment)} {a.paid ? <Badge tone="green">Pagado</Badge> : <Badge tone="amber">Pendiente</Badge>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

type StaffFormState = Omit<Staff, 'id' | 'created_at' | 'updated_at' | 'birth_date' | 'photo_path'> & { birth_date: string }

const emptyStaff = (): StaffFormState => ({
  full_name: '',
  phone: '',
  email: '',
  roles: [],
  status: 'activo',
  address: '',
  birth_date: '',
  emergency_contact: '',
  emergency_phone: '',
  bank_name: '',
  bank_account: '',
  rate_notes: '',
  equipment_notes: '',
  notes: '',
})

function StaffForm({ open, onClose, staff, onSaved }: { open: boolean; onClose: () => void; staff: Staff | null; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<StaffFormState>(emptyStaff())
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = open ? staff?.id ?? 'new' : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setF(staff ? { ...staff, birth_date: staff.birth_date ?? '' } : emptyStaff())
      setFile(null)
      setPreview(staff?.photo_path ? publicUrl(staff.photo_path) : '')
    }
  }

  const set = <K extends keyof StaffFormState>(k: K, v: StaffFormState[K]) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.full_name.trim()) return toast.error('Escribe el nombre.')
    setSaving(true)
    try {
      let photo_path = staff?.photo_path ?? null
      if (file) photo_path = await uploadFile('media', 'equipo', await compressImage(file, 800), file.name)
      const payload = {
        full_name: f.full_name.trim(),
        phone: f.phone,
        email: f.email,
        roles: f.roles,
        status: f.status,
        address: f.address,
        birth_date: f.birth_date || null,
        emergency_contact: f.emergency_contact,
        emergency_phone: f.emergency_phone,
        bank_name: f.bank_name,
        bank_account: f.bank_account,
        rate_notes: f.rate_notes,
        equipment_notes: f.equipment_notes,
        notes: f.notes,
        photo_path,
      }
      if (staff) await must(supabase.from('staff').update(payload).eq('id', staff.id).select('id').single())
      else await must(supabase.from('staff').insert(payload).select('id').single())
      if (file && staff?.photo_path) await removeFile('media', staff.photo_path)
      toast.success('Guardado')
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
      title={staff ? 'Editar persona' : 'Nueva persona'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="staff-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          <Avatar name={f.full_name || '?'} src={preview || null} size="lg" />
          <label className="btn-secondary btn-sm cursor-pointer">
            <ImagePlus className="h-4 w-4" /> Foto
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const err = validateImage(file)
                if (err) return toast.error(err)
                setFile(file)
                setPreview(URL.createObjectURL(file))
              }}
            />
          </label>
        </div>
        <Field label="Nombre completo" required>
          <input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Estatus">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as StaffStatus)}>
            {STAFF_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Funciones</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STAFF_ROLES.map((r) => (
              <Checkbox
                key={r}
                label={r}
                checked={f.roles.includes(r)}
                onChange={(on) => set('roles', on ? [...f.roles, r] : f.roles.filter((x) => x !== r))}
              />
            ))}
          </div>
        </div>
        <Field label="Teléfono / WhatsApp">
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Correo">
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Dirección">
          <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Fecha de nacimiento">
          <input className="input" type="date" value={f.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
        </Field>
        <Field label="Contacto de emergencia">
          <input className="input" value={f.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
        </Field>
        <Field label="Teléfono de emergencia">
          <input className="input" value={f.emergency_phone} onChange={(e) => set('emergency_phone', e.target.value)} />
        </Field>
        <Field label="Banco">
          <input className="input" value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
        </Field>
        <Field label="Cuenta / CLABE">
          <input className="input" value={f.bank_account} onChange={(e) => set('bank_account', e.target.value)} />
        </Field>
        <Field label="Tarifas / forma de pago" className="sm:col-span-2">
          <input className="input" value={f.rate_notes} onChange={(e) => set('rate_notes', e.target.value)} />
        </Field>
        <Field label="Equipo propio" className="sm:col-span-2">
          <input className="input" value={f.equipment_notes} onChange={(e) => set('equipment_notes', e.target.value)} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
