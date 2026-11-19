import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, InfoRow, LoadingBlock, StatCard } from '../../components/ui'
import ClientForm from '../../components/forms/ClientForm'
import EventForm from '../../components/forms/EventForm'
import WhatsAppBroadcast from '../../components/WhatsAppBroadcast'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { CLIENT_STATUS, CONTRACT_STATUS, EVENT_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { fmtDate, fmtDateTime, fmtMoney, num, seniority } from '../../lib/format'
import type { Client, ClientNote, Contract, EventRow, Profile, WaMessage } from '../../lib/types'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

export default function ClientDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [editOpen, setEditOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [waOpen, setWaOpen] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const q = useQuery(async () => {
    const [client, events, notes, contracts, messages, profiles] = await Promise.all([
      must<Client>(supabase.from('clients').select('*').eq('id', id).single()),
      must<EventRow[]>(supabase.from('events').select('*').eq('client_id', id).order('event_date', { ascending: false })),
      must<ClientNote[]>(supabase.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false })),
      must<Contract[]>(supabase.from('contracts').select('*').eq('client_id', id).order('created_at', { ascending: false })),
      must<WaMessage[]>(supabase.from('wa_messages').select('*').eq('client_id', id).order('sent_at', { ascending: false }).limit(20)),
      must<Pick<Profile, 'id' | 'full_name' | 'username'>[]>(supabase.from('profiles').select('id, full_name, username')),
    ])
    return { client, events, notes, contracts, messages, profiles: new Map(profiles.map((p) => [p.id, p.full_name || p.username])) }
  }, [id])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'No se encontró el cliente.'} onRetry={q.reload} />

  const { client, events, notes, contracts, messages, profiles } = q.data
  const valid = events.filter((e) => e.status !== 'cancelado')
  const total = valid.reduce((s, e) => s + num(e.total_amount), 0)
  const first = valid.length ? valid[valid.length - 1].event_date : null
  const since = first && first < client.client_since ? first : client.client_since

  const addNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setSavingNote(true)
    try {
      await must(supabase.from('client_notes').insert({ client_id: client.id, body: note.trim() }).select('id').single())
      setNote('')
      void q.reload()
    } catch (err) {
      toast.error(err)
    } finally {
      setSavingNote(false)
    }
  }

  const delNote = async (n: ClientNote) => {
    if (!(await confirm({ title: 'Eliminar nota', text: '¿Eliminar esta nota?' }))) return
    try {
      await must(supabase.from('client_notes').delete().eq('id', n.id).select('id'))
      void q.reload()
    } catch (err) {
      toast.error(err)
    }
  }

  const remove = async () => {
    if (events.length) return toast.error('Este cliente tiene eventos registrados. Elimina primero sus eventos o cámbialo a “Inactivo”.')
    if (!(await confirm({ title: 'Eliminar cliente', text: `¿Eliminar a ${client.full_name} y sus notas?` }))) return
    try {
      await must(supabase.from('clients').delete().eq('id', client.id).select('id'))
      toast.success('Cliente eliminado')
      navigate('/clientes')
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <div>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>
      <div className="card mb-6 flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold">{client.full_name}</h1>
            <Badge tone={optionTone(CLIENT_STATUS, client.status)}>{optionLabel(CLIENT_STATUS, client.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Cliente desde {fmtDate(since)} · {seniority(since)} con nosotros
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-whatsapp" onClick={() => setWaOpen(true)} disabled={!client.phone}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          <button className="btn-secondary" onClick={() => setEventOpen(true)}>
            <Plus className="h-4 w-4" /> Evento
          </button>
          <button className="btn-secondary" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button className="btn-icon text-red-500 hover:bg-red-50" onClick={() => void remove()} title="Eliminar cliente">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Eventos" value={valid.length} />
        {isAdmin && <StatCard label="Ha comprado" value={fmtMoney(total)} tone="green" />}
        <StatCard label="Último evento" value={valid[0] ? fmtDate(valid[0].event_date) : '—'} tone="blue" />
        <StatCard label="Antigüedad" value={seniority(since)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Historial de eventos" bodyClass="p-0">
            {events.length === 0 ? (
              <EmptyState title="Sin eventos" />
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Evento</th>
                    {isAdmin && <th className="text-right">Venta</th>}
                    <th>Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="row-link" onClick={() => navigate(`/eventos/${e.id}`)}>
                      <td>{fmtDate(e.event_date)}</td>
                      <td>
                        <p className="font-semibold">{e.event_type}</p>
                        <p className="text-xs text-slate-400">
                          {e.project_number}
                          {e.package ? ` · ${e.package.slice(0, 70)}${e.package.length > 70 ? '…' : ''}` : ''}
                        </p>
                      </td>
                      {isAdmin && <td className="text-right">{fmtMoney(e.total_amount)}</td>}
                      <td>
                        <Badge tone={optionTone(EVENT_STATUS, e.status)}>{optionLabel(EVENT_STATUS, e.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Notas de seguimiento">
            <form onSubmit={addNote} className="mb-4 flex gap-2">
              <input className="input" placeholder="Escribe una nota (llamada, cotización, preferencia…)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary" disabled={savingNote || !note.trim()}>
                <Send className="h-4 w-4" />
              </button>
            </form>
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500">Sin notas.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="group rounded-lg bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="whitespace-pre-line text-sm text-slate-700">{n.body}</p>
                      <button className="btn-icon opacity-0 transition group-hover:opacity-100 hover:text-red-600" onClick={() => void delNote(n)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {fmtDateTime(n.created_at)}
                      {n.created_by ? ` · ${profiles.get(n.created_by) ?? ''}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Datos de contacto">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Teléfono">{client.phone}</InfoRow>
              <InfoRow label="Correo">{client.email}</InfoRow>
              <InfoRow label="Dirección">{client.address}</InfoRow>
              <InfoRow label="Ciudad">{client.city}</InfoRow>
              <InfoRow label="Nos conoció por">{client.source}</InfoRow>
              <InfoRow label="Cumpleaños">{client.birthday ? fmtDate(client.birthday, "d 'de' MMMM") : ''}</InfoRow>
              <InfoRow label="Notas">{client.notes}</InfoRow>
            </dl>
          </Card>
          <Card title="Contratos" bodyClass="p-0">
            {contracts.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Sin contratos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {contracts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/contratos/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                      <span className="text-sm">
                        <span className="font-mono text-xs text-slate-400">{String(c.folio).padStart(4, '0')}</span> {c.data.event_type}
                      </span>
                      <Badge tone={optionTone(CONTRACT_STATUS, c.status)}>{optionLabel(CONTRACT_STATUS, c.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Mensajes enviados" bodyClass="p-0">
            {messages.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Sin mensajes registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {messages.map((m) => (
                  <li key={m.id} className="px-5 py-3">
                    <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-700">{m.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{fmtDateTime(m.sent_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ClientForm open={editOpen} onClose={() => setEditOpen(false)} client={client} onSaved={() => void q.reload()} />
      <EventForm open={eventOpen} onClose={() => setEventOpen(false)} defaultClientId={client.id} onSaved={(ev) => navigate(`/eventos/${ev.id}`)} />
      <WhatsAppBroadcast open={waOpen} onClose={() => { setWaOpen(false); void q.reload() }} clients={[client]} />
    </div>
  )
}
