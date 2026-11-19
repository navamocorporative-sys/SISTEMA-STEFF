import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileSignature, HardDrive, Info, MapPin, Pencil, Trash2, Users, Wallet, Heart, MessageCircle } from 'lucide-react'
import { Badge, Card, ErrorBlock, InfoRow, LoadingBlock, Tabs } from '../../components/ui'
import EventForm from '../../components/forms/EventForm'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { EVENT_SELECT } from '../../lib/data'
import { DELIVERY_TYPES, EVENT_STATUS, optionLabel, optionTone, serviceLabel } from '../../lib/constants'
import { fmtLongDate, fmtMoney, fmtTimeRange } from '../../lib/format'
import { openWhatsApp } from '../../lib/whatsapp'
import type { EventStatus, EventWithClient, Staff } from '../../lib/types'
import { useAuth, useSettings } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import PaymentsTab from './tabs/PaymentsTab'
import TeamTab from './tabs/TeamTab'
import FamilyTab from './tabs/FamilyTab'
import MaterialTab from './tabs/MaterialTab'
import ContractsTab from './tabs/ContractsTab'

type TabKey = 'resumen' | 'venta' | 'equipo' | 'familia' | 'material' | 'contratos'

export default function EventDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const settings = useSettings()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<TabKey>('resumen')
  const [editOpen, setEditOpen] = useState(false)

  const q = useQuery(async () => {
    const event = await must<EventWithClient>(supabase.from('events').select(EVENT_SELECT).eq('id', id).single())
    let seller: Pick<Staff, 'id' | 'full_name'> | null = null
    if (event.seller_id) {
      const { data } = await supabase.from('staff').select('id, full_name').eq('id', event.seller_id).maybeSingle()
      seller = (data as Pick<Staff, 'id' | 'full_name'> | null) ?? null
    }
    return { event, seller }
  }, [id])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'No se encontró el evento.'} onRetry={q.reload} />

  const e = q.data.event

  const changeStatus = async (status: EventStatus) => {
    try {
      await must(supabase.from('events').update({ status }).eq('id', e.id).select('id').single())
      q.setData((p) => (p ? { ...p, event: { ...p.event, status } } : p!))
      toast.success('Estatus actualizado')
    } catch (err) {
      toast.error(err)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Eliminar evento',
      text: `Se eliminará el evento ${e.project_number} con sus pagos, equipo asignado, familiares, respaldos, entregas y gastos. Los contratos se conservan. ¿Continuar?`,
    })
    if (!ok) return
    try {
      await must(supabase.from('events').delete().eq('id', e.id).select('id'))
      toast.success('Evento eliminado')
      navigate('/eventos')
    } catch (err) {
      toast.error(err)
    }
  }

  const slots = [
    { label: 'Sesión', place: e.sesion_place, url: e.sesion_maps_url, time: fmtTimeRange(e.sesion_start, e.sesion_end) },
    { label: 'Misa', place: e.misa_place, url: e.misa_maps_url, time: fmtTimeRange(e.misa_start, e.misa_end) },
    { label: 'Evento', place: e.evento_place, url: e.evento_maps_url, time: fmtTimeRange(e.evento_start, e.evento_end) },
  ]

  return (
    <div>
      <Link to="/eventos" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Eventos
      </Link>

      <div className="card mb-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-navy-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{e.project_number}</span>
              <Badge tone={optionTone(EVENT_STATUS, e.status)}>{optionLabel(EVENT_STATUS, e.status)}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold">
              {e.event_type}
              {e.main_names ? ` · ${e.main_names}` : ''}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {fmtLongDate(e.event_date)} · Cliente:{' '}
              {e.clients ? (
                <Link className="font-semibold text-navy-700 hover:underline" to={`/clientes/${e.clients.id}`}>
                  {e.clients.full_name}
                </Link>
              ) : (
                '—'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={e.status} onChange={(ev) => void changeStatus(ev.target.value as EventStatus)} aria-label="Cambiar estatus">
              {EVENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {e.clients?.phone && (
              <button className="btn-whatsapp" onClick={() => openWhatsApp(e.clients?.phone ?? '', `Hola ${e.clients?.full_name ?? ''}, `, settings.whatsapp_country_code)}>
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
            )}
            <button className="btn-secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </button>
            {isAdmin && (
              <Link className="btn-secondary" to={`/contratos/nuevo?evento=${e.id}`}>
                <FileSignature className="h-4 w-4" /> Contrato
              </Link>
            )}
            {isAdmin && (
              <button className="btn-icon text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => void remove()} title="Eliminar evento">
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'resumen', label: 'Resumen', icon: <Info className="h-4 w-4" /> },
          { value: 'venta', label: 'Venta y pagos', icon: <Wallet className="h-4 w-4" />, hidden: !isAdmin },
          { value: 'equipo', label: 'Equipo asignado y guía', icon: <Users className="h-4 w-4" /> },
          { value: 'familia', label: 'Familiares', icon: <Heart className="h-4 w-4" /> },
          { value: 'material', label: 'Respaldo y entregas', icon: <HardDrive className="h-4 w-4" /> },
          { value: 'contratos', label: 'Contratos', icon: <FileSignature className="h-4 w-4" /> },
        ]}
      />

      {tab === 'resumen' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Datos del evento" className="lg:col-span-2">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Tipo de evento">{e.event_type}</InfoRow>
              <InfoRow label="Nombres principales">{e.main_names}</InfoRow>
              <InfoRow label="Fecha">{fmtLongDate(e.event_date)}</InfoRow>
              <InfoRow label="Dirección">{e.address}</InfoRow>
              <InfoRow label="Servicios">{e.services.map(serviceLabel).join(', ')}</InfoRow>
              <InfoRow label="Paquete">{e.package}</InfoRow>
              <InfoRow label="Tiempo de entrega">{optionLabel(DELIVERY_TYPES, e.delivery_type)}</InfoRow>
              <InfoRow label="Impresión digital">{e.print_service}</InfoRow>
              <InfoRow label="Vendedor">{q.data.seller?.full_name ?? ''}</InfoRow>
              {isAdmin && <InfoRow label="Costo del servicio">{fmtMoney(e.total_amount)}</InfoRow>}
              <InfoRow label="Notas">{e.notes}</InfoRow>
            </dl>
          </Card>
          <div className="space-y-6">
            <Card title="Cliente">
              <dl>
                <InfoRow label="Nombre">{e.clients?.full_name ?? ''}</InfoRow>
                <InfoRow label="Teléfono">{e.clients?.phone ?? ''}</InfoRow>
              </dl>
            </Card>
            <Card title="Horarios y lugares">
              <div className="space-y-4">
                {slots.map((s) => (
                  <div key={s.label}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
                    {s.place || s.time ? (
                      <>
                        <p className="text-sm font-semibold text-slate-800">{s.place || '—'}</p>
                        <p className="text-sm text-slate-500">{s.time || 'Sin horario'}</p>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline">
                            <MapPin className="h-3.5 w-3.5" /> Ver ubicación
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">No aplica</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === 'venta' && isAdmin && <PaymentsTab event={e} />}
      {tab === 'equipo' && <TeamTab event={e} />}
      {tab === 'familia' && <FamilyTab event={e} />}
      {tab === 'material' && <MaterialTab event={e} />}
      {tab === 'contratos' && <ContractsTab event={e} />}

      <EventForm open={editOpen} onClose={() => setEditOpen(false)} event={e} onSaved={() => void q.reload()} />
    </div>
  )
}
