import { useEffect, useState, type FormEvent } from 'react'
import { Modal, Field } from '../ui'
import { supabase, must } from '../../lib/supabase'
import { CLIENT_SOURCES, CLIENT_STATUS } from '../../lib/constants'
import { todayISO } from '../../lib/format'
import type { Client, ClientStatus } from '../../lib/types'
import { useToast } from '../../context/ToastContext'

type FormState = Pick<Client, 'full_name' | 'phone' | 'email' | 'address' | 'city' | 'source' | 'status' | 'notes' | 'client_since'> & {
  birthday: string
}

const empty = (): FormState => ({
  full_name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  source: '',
  status: 'activo',
  notes: '',
  client_since: todayISO(),
  birthday: '',
})

export default function ClientForm({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  client?: Client | null
  onSaved: (c: Client) => void
}) {
  const toast = useToast()
  const [f, setF] = useState<FormState>(empty())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setF(
      client
        ? {
            full_name: client.full_name,
            phone: client.phone,
            email: client.email,
            address: client.address,
            city: client.city,
            source: client.source,
            status: client.status,
            notes: client.notes,
            client_since: client.client_since,
            birthday: client.birthday ?? '',
          }
        : empty(),
    )
  }, [open, client])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.full_name.trim()) {
      toast.error('Escribe el nombre del cliente.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...f,
        full_name: f.full_name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        birthday: f.birthday || null,
        client_since: f.client_since || todayISO(),
      }
      const saved = client
        ? await must<Client>(supabase.from('clients').update(payload).eq('id', client.id).select().single())
        : await must<Client>(supabase.from('clients').insert(payload).select().single())
      toast.success(client ? 'Cliente actualizado' : 'Cliente registrado')
      onSaved(saved)
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
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="client-form" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" required className="sm:col-span-2">
          <input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
        </Field>
        <Field label="Teléfono / WhatsApp" hint="10 dígitos">
          <input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Correo">
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="¿Cómo nos conoció?">
          <input className="input" list="client-sources" value={f.source} onChange={(e) => set('source', e.target.value)} />
          <datalist id="client-sources">
            {CLIENT_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Estatus">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as ClientStatus)}>
            {CLIENT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cliente desde">
          <input className="input" type="date" value={f.client_since} onChange={(e) => set('client_since', e.target.value)} />
        </Field>
        <Field label="Cumpleaños">
          <input className="input" type="date" value={f.birthday} onChange={(e) => set('birthday', e.target.value)} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <textarea className="input min-h-[80px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
