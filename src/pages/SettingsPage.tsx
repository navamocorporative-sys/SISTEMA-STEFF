import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Card, ErrorBlock, Field, LoadingBlock, Modal, PageHeader, Tabs } from '../components/ui'
import GuideEditor from '../components/GuideEditor'
import { useQuery } from '../hooks/useQuery'
import { supabase, must, USER_DOMAIN } from '../lib/supabase'
import { cloneGuide } from '../lib/data'
import { DEFAULT_GUIDE } from '../lib/defaults'
import type { GuideContent, GuideTemplate, Profile, Role, Settings } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'

type TabKey = 'negocio' | 'cuenta' | 'usuarios' | 'guia'

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<TabKey>(isAdmin ? 'negocio' : 'cuenta')
  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos del negocio, usuarios, contraseña y guía de trabajo predeterminada." />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'negocio', label: 'Negocio', hidden: !isAdmin },
          { value: 'cuenta', label: 'Mi cuenta' },
          { value: 'usuarios', label: 'Usuarios', hidden: !isAdmin },
          { value: 'guia', label: 'Guía de trabajo predeterminada', hidden: !isAdmin },
        ]}
      />
      {tab === 'negocio' && isAdmin && <BusinessTab />}
      {tab === 'cuenta' && <AccountTab />}
      {tab === 'usuarios' && isAdmin && <UsersTab />}
      {tab === 'guia' && isAdmin && <GuideTab />}
    </div>
  )
}

function BusinessTab() {
  const { settings, reloadSettings } = useAuth()
  const toast = useToast()
  const [f, setF] = useState<Settings | null>(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setF(settings), [settings])
  if (!f) return <LoadingBlock />
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((p) => (p ? { ...p, [k]: v } : p))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { id: _id, updated_at: _u, ...payload } = f
      void _id
      void _u
      await must(supabase.from('settings').upsert({ id: 1, ...payload, whatsapp_country_code: payload.whatsapp_country_code.replace(/\D/g, '') || '52' }).select('id').single())
      await reloadSettings()
      toast.success('Datos del negocio guardados')
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Datos del negocio">
      <form onSubmit={save} className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del negocio">
          <input className="input" value={f.business_name} onChange={(e) => set('business_name', e.target.value)} />
        </Field>
        <Field label="Ciudad (para contratos)">
          <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Representante (firma por defecto)">
          <input className="input" value={f.representative_name} onChange={(e) => set('representative_name', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Correo">
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Lada de país para WhatsApp" hint="México = 52">
          <input className="input" value={f.whatsapp_country_code} onChange={(e) => set('whatsapp_country_code', e.target.value)} />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <button className="btn-primary" disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Card>
  )
}

function AccountTab() {
  const { profile } = useAuth()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.')
    if (pw !== pw2) return toast.error('Las contraseñas no coinciden.')
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setPw('')
      setPw2('')
      toast.success('Contraseña actualizada')
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Mi usuario">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="label">Usuario para entrar</dt>
            <dd className="font-mono font-semibold">{profile?.username}</dd>
          </div>
          <div>
            <dt className="label">Nombre</dt>
            <dd>{profile?.full_name || '—'}</dd>
          </div>
          <div>
            <dt className="label">Rol</dt>
            <dd>{profile?.role === 'admin' ? 'Administrador' : 'Colaborador'}</dd>
          </div>
        </dl>
      </Card>
      <Card title="Cambiar contraseña">
        <form onSubmit={save} className="space-y-4">
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
            <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Confirmar contraseña">
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <button className="btn-primary" disabled={saving}>
            <KeyRound className="h-4 w-4" /> {saving ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </Card>
    </div>
  )
}

function UsersTab() {
  const { profile: me } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [pwFor, setPwFor] = useState<Profile | null>(null)
  const q = useQuery(() => must<Profile[]>(supabase.from('profiles').select('*').order('created_at')), [])

  const update = async (p: Profile, patch: Partial<Pick<Profile, 'role' | 'active' | 'full_name'>>) => {
    if (p.id === me?.id && (patch.role === 'colaborador' || patch.active === false)) {
      return toast.error('No puedes quitarte el rol de administrador ni desactivarte a ti mismo.')
    }
    try {
      await must(supabase.from('profiles').update(patch).eq('id', p.id).select('id').single())
      toast.success('Usuario actualizado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  const remove = async (p: Profile) => {
    if (!(await confirm({ title: 'Eliminar usuario', text: `¿Eliminar el acceso de "${p.username}"? Ya no podrá entrar al sistema.` }))) return
    try {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: p.id })
      if (error) throw error
      toast.success('Usuario eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  return (
    <Card
      title="Usuarios del sistema"
      actions={
        <button className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      }
      bodyClass="p-0"
    >
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Acceso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((p) => (
              <tr key={p.id}>
                <td className="font-mono font-semibold">
                  {p.username} {p.id === me?.id && <Badge tone="navy">Tú</Badge>}
                </td>
                <td>{p.full_name || '—'}</td>
                <td>
                  <select className="input w-40 py-1.5 text-xs" value={p.role} onChange={(e) => void update(p, { role: e.target.value as Role })}>
                    <option value="admin">Administrador</option>
                    <option value="colaborador">Colaborador</option>
                  </select>
                </td>
                <td>
                  <button className="text-left" onClick={() => void update(p, { active: !p.active })}>
                    {p.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Desactivado</Badge>}
                  </button>
                </td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-ghost btn-sm" onClick={() => setPwFor(p)}>
                    <KeyRound className="h-4 w-4" /> Contraseña
                  </button>
                  {p.id !== me?.id && (
                    <button className="btn-icon hover:text-red-600" onClick={() => void remove(p)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 p-4 text-xs text-slate-500">
        <b>Administrador:</b> ve y modifica todo (finanzas, pagos, contratos, plantillas, proveedores, publicidad, familiares, equipo humano). <b>Colaborador:</b> consulta la
        información y registra eventos, clientes, entregas, respaldos y equipo, sin ver dinero.
      </div>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => void q.reload()} />
      {pwFor && <ResetPasswordModal user={pwFor} onClose={() => setPwFor(null)} />}
    </Card>
  )
}

function CreateUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('colaborador')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setUsername('')
      setFullName('')
      setPassword('')
      setRole('colaborador')
    }
  }, [open])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) return toast.error('El usuario debe tener de 3 a 30 caracteres: letras, números, punto o guion (sin espacios).')
    if (password.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.')
    setSaving(true)
    try {
      const { error } = await supabase.rpc('admin_create_user', { p_username: u, p_password: password, p_full_name: fullName.trim(), p_role: role })
      if (error) throw error
      toast.success(`Usuario "${u}" creado`)
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
      title="Nuevo usuario"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="user-form" disabled={saving}>
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Usuario" hint={`Con este nombre inicia sesión (internamente: usuario@${USER_DOMAIN})`} required>
          <input className="input" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Nombre completo">
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres" required>
          <input className="input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Rol">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="colaborador">Colaborador</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const { profile: me } = useAuth()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres.')
    setSaving(true)
    try {
      if (user.id === me?.id) {
        const { error } = await supabase.auth.updateUser({ password: pw })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('admin_set_password', { p_user_id: user.id, p_password: pw })
        if (error) throw error
      }
      toast.success('Contraseña actualizada')
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
      title={`Nueva contraseña · ${user.username}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="pw-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="pw-form" onSubmit={submit}>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
          <input className="input" type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
      </form>
    </Modal>
  )
}

function GuideTab() {
  const toast = useToast()
  const [tpl, setTpl] = useState<GuideTemplate | null>(null)
  const [guide, setGuide] = useState<GuideContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    supabase
      .from('guide_templates')
      .select('*')
      .eq('is_default', true)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) return setError(err.message)
        const t = data as GuideTemplate | null
        setTpl(t)
        setGuide(cloneGuide(t?.content ?? DEFAULT_GUIDE))
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorBlock message={error} />
  if (!guide) return <LoadingBlock />

  const save = async () => {
    setSaving(true)
    try {
      if (tpl) {
        const saved = await must<GuideTemplate>(supabase.from('guide_templates').update({ content: guide }).eq('id', tpl.id).select().single())
        setTpl(saved)
      } else {
        const saved = await must<GuideTemplate>(supabase.from('guide_templates').insert({ name: 'Guía de trabajo estándar', is_default: true, content: guide }).select().single())
        setTpl(saved)
      }
      toast.success('Guía predeterminada guardada. Se usará en las nuevas guías.')
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Guía de trabajo predeterminada"
      actions={
        <button className="btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <p className="mb-5 text-sm text-slate-500">
        Es la base que se carga cuando creas la guía de una persona asignada a un evento. Los datos del evento (proyecto, fecha, lugares y horarios) se llenan solos.
      </p>
      <GuideEditor value={guide} onChange={setGuide} />
    </Card>
  )
}
