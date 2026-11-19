import { useState, type FormEvent } from 'react'
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, EmptyState, ErrorBlock, Field, LoadingBlock, Modal } from '../../../components/ui'
import { useQuery } from '../../../hooks/useQuery'
import { supabase, must } from '../../../lib/supabase'
import { compressImage, publicUrl, removeFile, uploadFile, validateImage } from '../../../lib/storage'
import type { EventRow, FamilyMember } from '../../../lib/types'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { useConfirm } from '../../../context/ConfirmContext'

export default function FamilyTab({ event }: { event: EventRow }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FamilyMember | null>(null)
  const q = useQuery(() => must<FamilyMember[]>(supabase.from('family_members').select('*').eq('event_id', event.id).order('created_at')), [event.id])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const remove = async (m: FamilyMember) => {
    if (!(await confirm({ title: 'Eliminar familiar', text: `¿Eliminar a ${m.name}?` }))) return
    try {
      await must(supabase.from('family_members').delete().eq('id', m.id).select('id'))
      await removeFile('media', m.photo_path)
      toast.success('Eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Card
      title="Familiares y personas importantes"
      actions={
        isAdmin && (
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Agregar familiar
          </button>
        )
      }
    >
      <p className="mb-4 text-sm text-slate-500">Fotos y nombres para que el equipo identifique a la familia el día del evento. Se pueden incluir en el PDF de la guía de trabajo.</p>
      {q.data.length === 0 ? (
        <EmptyState title="Sin familiares registrados" text={isAdmin ? 'Agrega fotos con el nombre y parentesco de cada persona.' : 'El administrador puede agregarlos.'} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {q.data.map((m) => (
            <div key={m.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="relative aspect-square bg-slate-100">
                {m.photo_path ? (
                  <img
                    src={publicUrl(m.photo_path)}
                    alt={m.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">Sin foto</div>
                )}
                {isAdmin && (
                  <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      className="rounded-md bg-white/90 p-1.5 text-navy-900 shadow hover:bg-white"
                      onClick={() => {
                        setEditing(m)
                        setOpen(true)
                      }}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded-md bg-white/90 p-1.5 text-red-600 shadow hover:bg-white" onClick={() => void remove(m)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-bold text-navy-900">{m.name}</p>
                <p className="truncate text-xs text-slate-500">{m.relationship || '—'}</p>
                {m.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{m.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <FamilyForm open={open} onClose={() => setOpen(false)} eventId={event.id} member={editing} onSaved={() => void q.reload()} />
    </Card>
  )
}

function FamilyForm({ open, onClose, eventId, member, onSaved }: { open: boolean; onClose: () => void; eventId: string; member: FamilyMember | null; onSaved: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = open ? member?.id ?? 'new' : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setName(member?.name ?? '')
      setRelationship(member?.relationship ?? '')
      setNotes(member?.notes ?? '')
      setFile(null)
      setPreview(member?.photo_path ? publicUrl(member.photo_path) : '')
    }
  }

  const pick = (f: File | undefined) => {
    if (!f) return
    const err = validateImage(f)
    if (err) return toast.error(err)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Escribe el nombre.')
    setSaving(true)
    try {
      let photo_path = member?.photo_path ?? null
      if (file) {
        photo_path = await uploadFile('media', `familiares/${eventId}`, await compressImage(file), file.name)
      }
      const payload = { event_id: eventId, name: name.trim(), relationship, notes, photo_path }
      if (member) await must(supabase.from('family_members').update(payload).eq('id', member.id).select('id').single())
      else await must(supabase.from('family_members').insert(payload).select('id').single())
      if (file && member?.photo_path) await removeFile('media', member.photo_path)
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
      title={member ? 'Editar familiar' : 'Agregar familiar'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="family-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="family-form" onSubmit={submit} className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500 hover:border-navy-300">
          {preview ? <img src={preview} alt="" className="h-48 w-full rounded-lg object-cover" /> : <ImagePlus className="h-8 w-8 text-slate-400" />}
          <span>{preview ? 'Cambiar foto' : 'Subir foto'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <Field label="Nombre" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Parentesco / rol" hint="Ej. Mamá, Papá, Padrino, Abuela">
          <input className="input" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </Field>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
