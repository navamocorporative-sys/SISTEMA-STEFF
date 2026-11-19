import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, MessageCircle, Plus, RefreshCw, Save, Trash2, Wand2 } from 'lucide-react'
import { Card, ErrorBlock, Field, LoadingBlock } from '../../components/ui'
import Combobox from '../../components/Combobox'
import { supabase, must } from '../../lib/supabase'
import { cloneContractTemplate, EVENT_SELECT, listClients, listContractTemplates } from '../../lib/data'
import { CONTRACT_STATUS, DELIVERY_TYPES, PAYMENT_CONCEPTS, optionLabel } from '../../lib/constants'
import { fmtDate, fmtMoney, fmtTimeRange, num, todayISO } from '../../lib/format'
import { buildContractPdf } from '../../lib/pdf/contractPdf'
import { fileSafe } from '../../lib/pdf/engine'
import { downloadBlob, signedUrl, uploadFile } from '../../lib/storage'
import { sendViaWhatsApp } from '../../lib/whatsapp'
import type {
  Client,
  Contract,
  ContractData,
  ContractPaymentRow,
  ContractStatus,
  ContractTemplate,
  DeliveryType,
  EventPayment,
  EventWithClient,
} from '../../lib/types'
import { useAuth, useSettings } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

function emptyData(tpl: ContractTemplate | null): ContractData {
  return {
    contract_date: todayISO(),
    event_type: '',
    event_date: '',
    client_name: '',
    main_names: '',
    address: '',
    contact: '',
    package: '',
    schedule: { sesion: { place: '', time: '' }, misa: { place: '', time: '' }, evento: { place: '', time: '' } },
    payments: [],
    total: 0,
    delivery_type: 'normal',
    extra_sections: [],
    template: cloneContractTemplate(tpl?.content),
    logo_path: tpl?.logo_path ?? null,
  }
}

function normalizeData(d: ContractData): ContractData {
  const base = emptyData(null)
  return {
    ...base,
    ...d,
    schedule: { ...base.schedule, ...(d.schedule ?? {}) },
    payments: d.payments ?? [],
    extra_sections: d.extra_sections ?? [],
    template: cloneContractTemplate(d.template),
    delivery_type: d.delivery_type ?? 'normal',
  }
}

export default function ContractEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const settings = useSettings()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [events, setEvents] = useState<EventWithClient[]>([])
  const [clientId, setClientId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [status, setStatus] = useState<ContractStatus>('borrador')
  const [data, setData] = useState<ContractData>(emptyData(null))
  const [busy, setBusy] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const previewRef = useRef<string>('')
  const contractRef = useRef<Contract | null>(null)
  contractRef.current = contract

  const set = <K extends keyof ContractData>(k: K, v: ContractData[K]) => setData((p) => ({ ...p, [k]: v }))

  const fillFromEvent = useCallback(
    async (ev: EventWithClient, base: ContractData, clientList: Client[]): Promise<ContractData> => {
      const client = clientList.find((c) => c.id === ev.client_id)
      let payments: ContractPaymentRow[] = []
      if (isAdmin) {
        const rows = await must<EventPayment[]>(supabase.from('event_payments').select('*').eq('event_id', ev.id).order('paid_on'))
        payments = rows.map((p) => ({ concept: optionLabel(PAYMENT_CONCEPTS, p.concept), amount: num(p.amount), date: p.paid_on }))
      }
      return {
        ...base,
        event_type: ev.event_type,
        event_date: ev.event_date,
        client_name: client?.full_name ?? ev.clients?.full_name ?? '',
        main_names: ev.main_names,
        address: ev.address || client?.address || '',
        contact: client?.phone ?? ev.clients?.phone ?? '',
        package: ev.package,
        schedule: {
          sesion: { place: ev.sesion_place, time: fmtTimeRange(ev.sesion_start, ev.sesion_end) },
          misa: { place: ev.misa_place, time: fmtTimeRange(ev.misa_start, ev.misa_end) },
          evento: { place: ev.evento_place, time: fmtTimeRange(ev.evento_start, ev.evento_end) },
        },
        payments,
        total: num(ev.total_amount),
        delivery_type: ev.delivery_type,
      }
    },
    [isAdmin],
  )

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [tpls, cls, evs] = await Promise.all([
          listContractTemplates(),
          listClients(),
          must<EventWithClient[]>(supabase.from('events').select(EVENT_SELECT).order('event_date', { ascending: false })),
        ])
        if (!alive) return
        setTemplates(tpls)
        setClients(cls)
        setEvents(evs)
        if (id) {
          const c = await must<Contract>(supabase.from('contracts').select('*').eq('id', id).single())
          if (!alive) return
          setContract(c)
          setClientId(c.client_id)
          setEventId(c.event_id)
          setTemplateId(c.template_id)
          setStatus(c.status)
          setData(normalizeData(c.data))
        } else {
          const def = tpls.find((t) => t.is_default) ?? tpls[0] ?? null
          setTemplateId(def?.id ?? null)
          let d = emptyData(def)
          d.template.representative = d.template.representative || settings.representative_name
          const evParam = params.get('evento')
          const ev = evParam ? evs.find((e) => e.id === evParam) : undefined
          if (ev) {
            d = await fillFromEvent(ev, d, cls)
            setEventId(ev.id)
            setClientId(ev.client_id)
          }
          if (!alive) return
          setData(d)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Cuando se guarda un contrato nuevo, cambia la dirección a la del contrato (al terminar cualquier acción).
  useEffect(() => {
    if (!id && contract && !busy) navigate(`/contratos/${contract.id}`, { replace: true })
  }, [id, contract, busy, navigate])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const clientItems = useMemo(() => clients.map((c) => ({ id: c.id, label: c.full_name, sub: c.phone })), [clients])
  const clientEvents = useMemo(() => events.filter((e) => !clientId || e.client_id === clientId), [events, clientId])
  const eventItems = useMemo(
    () => clientEvents.map((e) => ({ id: e.id, label: `${e.event_type}${e.main_names ? ` · ${e.main_names}` : ''}`, sub: `${e.project_number} · ${fmtDate(e.event_date)} · ${e.clients?.full_name ?? ''}` })),
    [clientEvents],
  )

  const pickClient = (cid: string | null) => {
    setClientId(cid)
    const c = clients.find((x) => x.id === cid)
    if (c) setData((p) => ({ ...p, client_name: c.full_name, contact: c.phone, address: p.address || c.address }))
    if (eventId && cid && !events.find((e) => e.id === eventId && e.client_id === cid)) setEventId(null)
    const evs = events.filter((e) => e.client_id === cid)
    if (evs.length === 1) void pickEvent(evs[0].id)
  }

  const pickEvent = async (eid: string | null) => {
    setEventId(eid)
    const ev = events.find((e) => e.id === eid)
    if (!ev) return
    try {
      setClientId(ev.client_id)
      const filled = await fillFromEvent(ev, data, clients)
      setData(filled)
      toast.info('Datos del evento cargados')
    } catch (e) {
      toast.error(e)
    }
  }

  const pickTemplate = (tid: string) => {
    const t = templates.find((x) => x.id === tid)
    if (!t) return
    setTemplateId(tid)
    setData((p) => ({ ...p, template: cloneContractTemplate(t.content), logo_path: t.logo_path }))
  }

  const total = num(data.total)
  const paid = data.payments.reduce((s, p) => s + num(p.amount), 0)

  const validate = (): boolean => {
    if (!data.client_name.trim()) {
      toast.error('Falta el nombre del cliente.')
      return false
    }
    return true
  }

  const save = async (opts?: { silent?: boolean; status?: ContractStatus; pdf_path?: string }): Promise<Contract | null> => {
    if (!isAdmin) return contractRef.current
    if (!validate()) return null
    try {
      const payload = {
        client_id: clientId,
        event_id: eventId,
        template_id: templateId,
        contract_date: data.contract_date || todayISO(),
        status: opts?.status ?? status,
        data,
        ...(opts?.pdf_path ? { pdf_path: opts.pdf_path } : {}),
      }
      const current = contractRef.current
      const saved = current
        ? await must<Contract>(supabase.from('contracts').update(payload).eq('id', current.id).select().single())
        : await must<Contract>(supabase.from('contracts').insert(payload).select().single())
      contractRef.current = saved
      setContract(saved)
      setStatus(saved.status)
      if (!opts?.silent) toast.success('Contrato guardado')
      return saved
    } catch (e) {
      toast.error(e)
      return null
    }
  }

  const preview = async () => {
    setBusy('preview')
    try {
      const blob = await buildContractPdf(data, contract?.folio)
      const url = URL.createObjectURL(blob)
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      previewRef.current = url
      setPreviewUrl(url)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const fileName = (folio?: number) => `Contrato_${folio ? String(folio).padStart(4, '0') + '_' : ''}${fileSafe(data.client_name)}.pdf`

  const download = async () => {
    if (!validate()) return
    setBusy('pdf')
    try {
      const saved = isAdmin ? await save({ silent: true }) : contract
      if (isAdmin && !saved) return
      downloadBlob(await buildContractPdf(data, saved?.folio), fileName(saved?.folio))
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const whatsapp = async () => {
    if (!validate()) return
    if (!data.contact.trim()) return toast.error('Agrega el teléfono de contacto del cliente.')
    setBusy('wa')
    try {
      await sendViaWhatsApp(
        data.contact,
        async () => {
          const first = await save({ silent: true })
          if (!first) throw new Error('No se pudo guardar el contrato.')
          const blob = await buildContractPdf(data, first.folio)
          const path = await uploadFile('documentos', 'contratos', blob, fileName(first.folio))
          await save({ silent: true, status: status === 'borrador' ? 'enviado' : status, pdf_path: path })
          const url = await signedUrl(path)
          return `Hola ${data.client_name}, te compartimos tu contrato de ${settings.business_name} para tu evento (${data.event_type}${
            data.event_date ? `, ${fmtDate(data.event_date, "d 'de' MMMM yyyy")}` : ''
          }).\n\nPuedes verlo y descargarlo aquí: ${url}`
        },
        settings.whatsapp_country_code,
      )
      toast.success('Contrato listo para enviar por WhatsApp')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} />

  const slots: { key: 'sesion' | 'misa' | 'evento'; label: string }[] = [
    { key: 'sesion', label: 'Sesión' },
    { key: 'misa', label: 'Misa' },
    { key: 'evento', label: 'Evento' },
  ]

  return (
    <div>
      <Link to="/contratos" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Contratos
      </Link>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{contract ? `Contrato ${String(contract.folio).padStart(4, '0')}` : 'Nuevo contrato'}</h1>
          <p className="text-sm text-slate-500">Selecciona al cliente y su evento: la información se llena automáticamente. Puedes ajustar cualquier dato antes de generar el PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => void preview()} disabled={!!busy}>
            <Eye className="h-4 w-4" /> {busy === 'preview' ? 'Generando…' : 'Vista previa'}
          </button>
          <button className="btn-secondary" onClick={() => void download()} disabled={!!busy}>
            <Download className="h-4 w-4" /> {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
          </button>
          {isAdmin && (
            <>
              <button className="btn-whatsapp" onClick={() => void whatsapp()} disabled={!!busy}>
                <MessageCircle className="h-4 w-4" /> {busy === 'wa' ? 'Preparando…' : 'Enviar por WhatsApp'}
              </button>
              <button className="btn-primary" onClick={() => void save()} disabled={!!busy}>
                <Save className="h-4 w-4" /> Guardar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <Card title="Llenado automático">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Cliente">
                <Combobox items={clientItems} value={clientId} onChange={pickClient} placeholder="Escribe el nombre del cliente…" />
              </Field>
              <Field label="Evento registrado">
                <Combobox items={eventItems} value={eventId} onChange={(v) => void pickEvent(v)} placeholder="Selecciona el evento…" emptyText="Este cliente no tiene eventos" />
              </Field>
              <Field label="Plantilla">
                <select className="input" value={templateId ?? ''} onChange={(e) => pickTemplate(e.target.value)}>
                  {!templateId && <option value="">— Estándar —</option>}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.is_default ? ' (predeterminada)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {eventId && (
              <button className="btn-ghost btn-sm mt-3" onClick={() => void pickEvent(eventId)}>
                <Wand2 className="h-4 w-4" /> Volver a cargar datos del evento
              </button>
            )}
          </Card>

          <Card title="Datos del contrato">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={data.template.city_line || 'Fecha del contrato'}>
                <input className="input" type="date" value={data.contract_date} onChange={(e) => set('contract_date', e.target.value)} />
              </Field>
              <Field label="Estatus">
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)} disabled={!isAdmin}>
                  {CONTRACT_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de evento">
                <input className="input" value={data.event_type} onChange={(e) => set('event_type', e.target.value)} />
              </Field>
              <Field label="Fecha de evento">
                <input className="input" type="date" value={data.event_date} onChange={(e) => set('event_date', e.target.value)} />
              </Field>
              <Field label="Nombre del cliente" required>
                <input className="input" value={data.client_name} onChange={(e) => set('client_name', e.target.value)} />
              </Field>
              <Field label="Nombres principales">
                <input className="input" value={data.main_names} onChange={(e) => set('main_names', e.target.value)} />
              </Field>
              <Field label="Dirección" className="sm:col-span-2">
                <input className="input" value={data.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="Contacto (teléfono)">
                <input className="input" value={data.contact} onChange={(e) => set('contact', e.target.value)} />
              </Field>
              <Field label="Tiempo de entrega">
                <select className="input" value={data.delivery_type} onChange={(e) => set('delivery_type', e.target.value as DeliveryType)}>
                  {DELIVERY_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Paquete" className="sm:col-span-2">
                <textarea className="input min-h-[80px]" value={data.package} onChange={(e) => set('package', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Horarios">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {slots.map((s) => (
                <div key={s.key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-sm font-bold text-navy-900">{s.label}</p>
                  <input
                    className="input"
                    placeholder="Dirección / lugar"
                    value={data.schedule[s.key].place}
                    onChange={(e) => set('schedule', { ...data.schedule, [s.key]: { ...data.schedule[s.key], place: e.target.value } })}
                  />
                  <input
                    className="input"
                    placeholder="Hora (ej. 7:00 PM – 12:00 AM)"
                    value={data.schedule[s.key].time}
                    onChange={(e) => set('schedule', { ...data.schedule, [s.key]: { ...data.schedule[s.key], time: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Plan de pagos"
            actions={
              <button className="btn-ghost btn-sm" onClick={() => set('payments', [...data.payments, { concept: data.payments.length ? 'Abono' : 'Anticipo', amount: 0, date: todayISO() }])}>
                <Plus className="h-4 w-4" /> Agregar pago
              </button>
            }
          >
            <div className="space-y-2">
              {data.payments.length === 0 && <p className="text-sm text-slate-500">Sin pagos. En el PDF aparecerá una fila de abono en blanco.</p>}
              {data.payments.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <input
                    className="input"
                    value={p.concept}
                    onChange={(e) => set('payments', data.payments.map((x, j) => (j === i ? { ...x, concept: e.target.value } : x)))}
                    placeholder="Concepto"
                  />
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={String(p.amount)}
                    onChange={(e) => set('payments', data.payments.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
                  />
                  <input className="input" type="date" value={p.date} onChange={(e) => set('payments', data.payments.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                  <button className="btn-icon hover:text-red-600" onClick={() => set('payments', data.payments.filter((_, j) => j !== i))} title="Quitar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <Field label="Total a pagar">
                <input className="input" type="number" min="0" step="0.01" value={String(data.total)} onChange={(e) => set('total', Number(e.target.value) || 0)} />
              </Field>
              <div>
                <span className="label">Pagado</span>
                <p className="py-2 font-semibold text-emerald-700">{fmtMoney(paid)}</p>
              </div>
              <div>
                <span className="label">Saldo</span>
                <p className="py-2 font-semibold text-amber-700">{fmtMoney(Math.max(total - paid, 0))}</p>
              </div>
            </div>
          </Card>

          {isAdmin && (
            <Card
              title="Apartados adicionales (solo este contrato)"
              actions={
                <button className="btn-ghost btn-sm" onClick={() => set('extra_sections', [...data.extra_sections, { title: '', body: '' }])}>
                  <Plus className="h-4 w-4" /> Agregar apartado
                </button>
              }
            >
              {data.extra_sections.length === 0 ? (
                <p className="text-sm text-slate-500">Agrega condiciones especiales, notas o acuerdos que solo apliquen a este contrato.</p>
              ) : (
                <div className="space-y-3">
                  {data.extra_sections.map((s, i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="flex gap-2">
                        <input
                          className="input font-semibold"
                          placeholder="Título del apartado"
                          value={s.title}
                          onChange={(e) => set('extra_sections', data.extra_sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        />
                        <button className="btn-icon hover:text-red-600" onClick={() => set('extra_sections', data.extra_sections.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        className="input min-h-[80px]"
                        placeholder="Texto"
                        value={s.body}
                        onChange={(e) => set('extra_sections', data.extra_sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="2xl:sticky 2xl:top-6 2xl:self-start">
          <Card
            title="Vista previa del PDF"
            actions={
              <button className="btn-ghost btn-sm" onClick={() => void preview()} disabled={!!busy}>
                <RefreshCw className="h-4 w-4" /> Actualizar
              </button>
            }
            bodyClass="p-0"
          >
            {previewUrl ? (
              <iframe title="Vista previa del contrato" src={previewUrl} className="h-[75vh] w-full rounded-b-xl" />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
                <Eye className="h-8 w-8 text-slate-300" />
                Presiona “Vista previa” para ver el contrato tal como quedará en PDF (tamaño carta).
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
