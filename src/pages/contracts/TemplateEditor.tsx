import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, ImagePlus, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Card, Checkbox, ErrorBlock, Field, LoadingBlock } from '../../components/ui'
import { supabase, must } from '../../lib/supabase'
import { cloneContractTemplate } from '../../lib/data'
import { buildContractPdf } from '../../lib/pdf/contractPdf'
import { compressImage, publicUrl, uploadFile, validateImage } from '../../lib/storage'
import { todayISO } from '../../lib/format'
import logoSteff from '../../assets/logo-steff.png'
import type { ContractBlock, ContractBlockType, ContractData, ContractTemplate, ContractTemplateContent } from '../../lib/types'
import { useToast } from '../../context/ToastContext'

const BLOCK_LABELS: Record<ContractBlockType, string> = {
  datos: 'Datos del cliente y del evento',
  paquete: 'Paquete',
  horarios: 'Horarios (sesión, misa, evento)',
  plan_pagos: 'Plan de pagos',
  tiempo_entrega: 'Tiempo de entrega',
  notas: 'Notas',
  firmas: 'Firmas',
  clausulas: 'Cláusulas',
  texto: 'Texto libre',
}

const DEFAULT_TITLES: Record<ContractBlockType, string> = {
  datos: 'Datos del cliente',
  paquete: 'Paquete',
  horarios: 'Horarios',
  plan_pagos: 'PLAN DE PAGOS',
  tiempo_entrega: 'TIEMPO DE ENTREGA',
  notas: 'Notas',
  firmas: 'Firmas',
  clausulas: 'CLÁUSULAS',
  texto: 'Nuevo apartado',
}

function newBlock(type: ContractBlockType): ContractBlock {
  const b: ContractBlock = { id: `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, type, enabled: true, title: DEFAULT_TITLES[type] }
  if (type === 'notas' || type === 'clausulas') b.items = ['']
  if (type === 'tiempo_entrega') b.options = [{ name: 'NORMAL', time: '', price: 'Incluido en paquete' }]
  if (type === 'texto') b.body = ''
  return b
}

function sampleData(content: ContractTemplateContent, logoPath: string | null): ContractData {
  return {
    contract_date: todayISO(),
    event_type: 'Tipo de evento',
    event_date: todayISO(),
    client_name: 'Nombre del cliente',
    main_names: '',
    address: '',
    contact: '',
    package: 'Descripción del paquete contratado',
    schedule: { sesion: { place: '', time: '' }, misa: { place: '', time: '' }, evento: { place: 'Lugar del evento', time: '' } },
    payments: [{ concept: 'Anticipo', amount: 0, date: todayISO() }],
    total: 0,
    delivery_type: 'normal',
    extra_sections: [],
    template: content,
    logo_path: logoPath,
  }
}

export default function TemplateEditor() {
  const { id = '' } = useParams()
  const toast = useToast()
  const [tpl, setTpl] = useState<ContractTemplate | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState<ContractTemplateContent>(cloneContractTemplate(null))
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const urlRef = useRef('')
  const [addType, setAddType] = useState<ContractBlockType>('texto')

  useEffect(() => {
    let alive = true
    must<ContractTemplate>(supabase.from('contract_templates').select('*').eq('id', id).single())
      .then((t) => {
        if (!alive) return
        setTpl(t)
        setName(t.name)
        setContent(cloneContractTemplate(t.content))
        setLogoPath(t.logo_path)
        setIsDefault(t.is_default)
      })
      .catch((e: unknown) => alive && setError((e as { message?: string })?.message ?? 'No se encontró la plantilla.'))
    return () => {
      alive = false
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [id])

  if (error) return <ErrorBlock message={error} />
  if (!tpl) return <LoadingBlock />

  const set = <K extends keyof ContractTemplateContent>(k: K, v: ContractTemplateContent[K]) => setContent((p) => ({ ...p, [k]: v }))
  const setBlock = (i: number, b: ContractBlock) => set('blocks', content.blocks.map((x, j) => (j === i ? b : x)))
  const move = (i: number, d: -1 | 1) => {
    const arr = [...content.blocks]
    const j = i + d
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    set('blocks', arr)
  }

  const preview = async () => {
    setBusy(true)
    try {
      const blob = await buildContractPdf(sampleData(content, logoPath), null)
      const url = URL.createObjectURL(blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      setPreviewUrl(url)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return
    const err = validateImage(file)
    if (err) return toast.error(err)
    try {
      const path = await uploadFile('media', 'logos', await compressImage(file, 1000), file.name)
      setLogoPath(path)
      set('show_logo', true)
      toast.success('Logo cargado. Recuerda guardar la plantilla.')
    } catch (e) {
      toast.error(e)
    }
  }

  const save = async () => {
    if (!name.trim()) return toast.error('Escribe el nombre de la plantilla.')
    setSaving(true)
    try {
      if (isDefault && !tpl.is_default) {
        await must(supabase.from('contract_templates').update({ is_default: false }).eq('is_default', true).select('id'))
      }
      const saved = await must<ContractTemplate>(
        supabase
          .from('contract_templates')
          .update({ name: name.trim(), content, logo_path: logoPath, is_default: isDefault || tpl.is_default })
          .eq('id', tpl.id)
          .select()
          .single(),
      )
      setTpl(saved)
      setIsDefault(saved.is_default)
      toast.success('Plantilla guardada')
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link to="/contratos" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Contratos
      </Link>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Diseño de plantilla de contrato</h1>
          <p className="text-sm text-slate-500">Agrega, quita, ordena y edita los apartados. Los contratos ya creados no cambian.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => void preview()} disabled={busy}>
            <Eye className="h-4 w-4" /> {busy ? 'Generando…' : 'Vista previa'}
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <Card title="General">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre de la plantilla">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Título del documento">
                <input className="input" value={content.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label="Texto de lugar y fecha">
                <input className="input" value={content.city_line} onChange={(e) => set('city_line', e.target.value)} />
              </Field>
              <Field label="Nombre para la firma (empresa)">
                <input className="input" value={content.representative} onChange={(e) => set('representative', e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <span className="label">Logo del contrato</span>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
                    {content.show_logo ? (
                      <img src={logoPath ? publicUrl(logoPath) : logoSteff} alt="Logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400">Sin logo</span>
                    )}
                  </div>
                  <label className="btn-secondary btn-sm cursor-pointer">
                    <ImagePlus className="h-4 w-4" /> Subir logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
                  </label>
                  {logoPath && (
                    <button className="btn-ghost btn-sm" onClick={() => setLogoPath(null)}>
                      <X className="h-4 w-4" /> Usar logo STEFF
                    </button>
                  )}
                  <Checkbox checked={content.show_logo} onChange={(v) => set('show_logo', v)} label="Mostrar logo" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Checkbox checked={isDefault} onChange={setIsDefault} label="Usar como plantilla predeterminada para contratos nuevos" />
              </div>
            </div>
          </Card>

          <Card title="Apartados del contrato">
            <div className="space-y-3">
              {content.blocks.map((b, i) => (
                <div key={b.id} className={`rounded-xl border ${b.enabled ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-70'}`}>
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="rounded bg-navy-100 px-2 py-0.5 text-[11px] font-bold uppercase text-navy-800">{BLOCK_LABELS[b.type]}</span>
                    <input className="input min-w-[140px] flex-1 py-1.5" value={b.title} onChange={(e) => setBlock(i, { ...b, title: e.target.value })} />
                    <Checkbox checked={b.enabled} onChange={(v) => setBlock(i, { ...b, enabled: v })} label="Visible" />
                    <Checkbox checked={!!b.new_page} onChange={(v) => setBlock(i, { ...b, new_page: v })} label="Nueva hoja" />
                    <button className="btn-icon" onClick={() => move(i, -1)} disabled={i === 0} title="Subir">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button className="btn-icon" onClick={() => move(i, 1)} disabled={i === content.blocks.length - 1} title="Bajar">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button className="btn-icon hover:text-red-600" onClick={() => set('blocks', content.blocks.filter((_, j) => j !== i))} title="Eliminar apartado">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-3">
                    {(b.type === 'notas' || b.type === 'clausulas') && (
                      <div className="space-y-2">
                        {(b.items ?? []).map((t, k) => (
                          <div key={k} className="flex gap-2">
                            <span className="w-6 pt-2 text-right text-xs font-bold text-slate-400">{k + 1}.</span>
                            <textarea
                              rows={Math.max(2, Math.ceil(t.length / 95))}
                              className="input flex-1 text-sm"
                              value={t}
                              onChange={(e) => setBlock(i, { ...b, items: (b.items ?? []).map((x, m) => (m === k ? e.target.value : x)) })}
                            />
                            <button className="btn-icon self-start hover:text-red-600" onClick={() => setBlock(i, { ...b, items: (b.items ?? []).filter((_, m) => m !== k) })}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button className="btn-ghost btn-sm" onClick={() => setBlock(i, { ...b, items: [...(b.items ?? []), ''] })}>
                          <Plus className="h-4 w-4" /> {b.type === 'notas' ? 'Agregar nota' : 'Agregar cláusula'}
                        </button>
                      </div>
                    )}
                    {b.type === 'tiempo_entrega' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-semibold uppercase text-slate-400">
                          <span>Opción</span>
                          <span>Tiempo</span>
                          <span>Precio</span>
                          <span />
                        </div>
                        {(b.options ?? []).map((o, k) => (
                          <div key={k} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                            {(['name', 'time', 'price'] as const).map((f) => (
                              <input
                                key={f}
                                className="input"
                                value={o[f]}
                                onChange={(e) => setBlock(i, { ...b, options: (b.options ?? []).map((x, m) => (m === k ? { ...x, [f]: e.target.value } : x)) })}
                              />
                            ))}
                            <button className="btn-icon hover:text-red-600" onClick={() => setBlock(i, { ...b, options: (b.options ?? []).filter((_, m) => m !== k) })}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        {(b.options ?? []).length < 3 && (
                          <button className="btn-ghost btn-sm" onClick={() => setBlock(i, { ...b, options: [...(b.options ?? []), { name: '', time: '', price: '' }] })}>
                            <Plus className="h-4 w-4" /> Agregar opción
                          </button>
                        )}
                        <p className="text-xs text-slate-400">La opción elegida en cada contrato (Normal / Express 1 / Express 2) se marca en gris en el PDF.</p>
                      </div>
                    )}
                    {b.type === 'texto' && (
                      <textarea className="input min-h-[100px]" value={b.body ?? ''} onChange={(e) => setBlock(i, { ...b, body: e.target.value })} placeholder="Escribe el texto del apartado" />
                    )}
                    {['datos', 'paquete', 'horarios', 'plan_pagos', 'firmas'].includes(b.type) && (
                      <p className="text-xs text-slate-500">Este apartado se llena automáticamente con la información de cada contrato.</p>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-3">
                <select className="input w-auto" value={addType} onChange={(e) => setAddType(e.target.value as ContractBlockType)}>
                  {(Object.keys(BLOCK_LABELS) as ContractBlockType[]).map((t) => (
                    <option key={t} value={t}>
                      {BLOCK_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary" onClick={() => set('blocks', [...content.blocks, newBlock(addType)])}>
                  <Plus className="h-4 w-4" /> Agregar apartado
                </button>
              </div>
            </div>
          </Card>
        </div>

        <div className="2xl:sticky 2xl:top-6 2xl:self-start">
          <Card
            title="Vista previa"
            actions={
              <button className="btn-ghost btn-sm" onClick={() => void preview()} disabled={busy}>
                <RefreshCw className="h-4 w-4" /> Actualizar
              </button>
            }
            bodyClass="p-0"
          >
            {previewUrl ? (
              <iframe title="Vista previa de la plantilla" src={previewUrl} className="h-[75vh] w-full rounded-b-xl" />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
                <Eye className="h-8 w-8 text-slate-300" />
                Presiona “Vista previa” para ver cómo queda el contrato con esta plantilla.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
