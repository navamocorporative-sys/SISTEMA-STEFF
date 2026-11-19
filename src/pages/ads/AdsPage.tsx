import { useMemo, useState, type FormEvent } from 'react'
import { ImagePlus, Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, Field, LoadingBlock, Modal, PageHeader, StatCard, Tabs } from '../../components/ui'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { AD_PLATFORMS, CAMPAIGN_RESULT, CAMPAIGN_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { fmtDate, fmtMoney, num } from '../../lib/format'
import { compressImage, publicUrl, removeFile, uploadFile, validateImage } from '../../lib/storage'
import type { AdCampaign, MoodboardItem } from '../../lib/types'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

type TabKey = 'campanas' | 'analisis' | 'ideas' | 'moodboard'

function roi(c: Pick<AdCampaign, 'spent' | 'revenue'>): number | null {
  const s = num(c.spent)
  if (s <= 0) return null
  return ((num(c.revenue) - s) / s) * 100
}

export default function AdsPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<TabKey>('campanas')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdCampaign | null>(null)
  const [newKind, setNewKind] = useState<{ kind: AdCampaign['kind']; status: AdCampaign['status'] }>({ kind: 'publicidad', status: 'planeada' })

  const q = useQuery(() => must<AdCampaign[]>(supabase.from('ad_campaigns').select('*').order('start_date', { ascending: false, nullsFirst: true })), [])

  const all = q.data ?? []
  const campaigns = all.filter((c) => c.status !== 'idea')
  const ideas = all.filter((c) => c.status === 'idea')

  const analysis = useMemo(() => {
    const m = new Map<string, { spent: number; leads: number; sales: number; revenue: number; count: number }>()
    for (const c of campaigns) {
      const k = c.platform || 'Sin plataforma'
      const a = m.get(k) ?? { spent: 0, leads: 0, sales: 0, revenue: 0, count: 0 }
      a.spent += num(c.spent)
      a.leads += num(c.leads)
      a.sales += num(c.sales)
      a.revenue += num(c.revenue)
      a.count += 1
      m.set(k, a)
    }
    return [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data])

  const totalSpent = campaigns.reduce((s, c) => s + num(c.spent), 0)
  const totalRevenue = campaigns.reduce((s, c) => s + num(c.revenue), 0)
  const totalLeads = campaigns.reduce((s, c) => s + num(c.leads), 0)
  const totalSales = campaigns.reduce((s, c) => s + num(c.sales), 0)

  const openNew = (kind: AdCampaign['kind'], status: AdCampaign['status']) => {
    setEditing(null)
    setNewKind({ kind, status })
    setFormOpen(true)
  }

  const remove = async (c: AdCampaign) => {
    if (!(await confirm({ title: 'Eliminar', text: `¿Eliminar "${c.name}"?` }))) return
    try {
      await must(supabase.from('ad_campaigns').delete().eq('id', c.id).select('id'))
      toast.success('Eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  const promote = async (c: AdCampaign) => {
    try {
      await must(supabase.from('ad_campaigns').update({ status: 'planeada' }).eq('id', c.id).select('id').single())
      toast.success('La idea pasó a campañas planeadas')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div>
      <PageHeader
        title="Publicidad"
        subtitle="Registro de gastos en publicidad, análisis de estrategias, ideas y moodboard."
        actions={
          isAdmin &&
          tab !== 'moodboard' && (
            <button className="btn-primary" onClick={() => (tab === 'ideas' ? openNew('publicidad', 'idea') : openNew('publicidad', 'planeada'))}>
              <Plus className="h-4 w-4" /> {tab === 'ideas' ? 'Nueva idea' : 'Nueva campaña'}
            </button>
          )
        }
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'campanas', label: 'Campañas y gastos' },
          { value: 'analisis', label: 'Análisis' },
          { value: 'ideas', label: 'Ideas e innovación' },
          { value: 'moodboard', label: 'Moodboard' },
        ]}
      />

      {tab === 'moodboard' ? (
        <Moodboard />
      ) : q.loading && !q.data ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock message={q.error} onRetry={q.reload} />
      ) : (
        <>
          {tab === 'campanas' && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Invertido en publicidad" value={fmtMoney(totalSpent)} />
                <StatCard label="Prospectos (leads)" value={totalLeads} tone="blue" hint={totalLeads ? `Costo por prospecto: ${fmtMoney(totalSpent / totalLeads)}` : undefined} />
                <StatCard label="Ventas logradas" value={totalSales} tone="green" />
                <StatCard label="Ingresos generados" value={fmtMoney(totalRevenue)} tone="green" hint={totalSpent ? `Retorno: ${(((totalRevenue - totalSpent) / totalSpent) * 100).toFixed(0)}%` : undefined} />
              </div>
              <Card bodyClass="p-0">
                {campaigns.length === 0 ? (
                  <EmptyState title="Sin campañas" text="Registra cada campaña con su costo y resultados para saber qué funciona." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Campaña</th>
                          <th>Periodo</th>
                          <th className="text-right">Gasto</th>
                          <th className="text-right">Leads</th>
                          <th className="text-right">Ventas</th>
                          <th className="text-right">Ingresos</th>
                          <th className="text-right">Retorno</th>
                          <th>Estatus</th>
                          <th>Resultado</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => {
                          const r = roi(c)
                          return (
                            <tr key={c.id}>
                              <td>
                                <p className="font-semibold">{c.name}</p>
                                <p className="text-xs text-slate-400">
                                  {c.platform || '—'}
                                  {c.kind === 'innovacion' ? ' · Innovación' : ''}
                                  {c.objective ? ` · ${c.objective}` : ''}
                                </p>
                              </td>
                              <td className="whitespace-nowrap text-xs">
                                {fmtDate(c.start_date)}
                                {c.end_date ? ` – ${fmtDate(c.end_date)}` : ''}
                              </td>
                              <td className="text-right">{fmtMoney(c.spent)}</td>
                              <td className="text-right">{c.leads}</td>
                              <td className="text-right">{c.sales}</td>
                              <td className="text-right">{fmtMoney(c.revenue)}</td>
                              <td className={`text-right font-semibold ${r === null ? 'text-slate-400' : r >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{r === null ? '—' : `${r.toFixed(0)}%`}</td>
                              <td>
                                <Badge tone={optionTone(CAMPAIGN_STATUS, c.status)}>{optionLabel(CAMPAIGN_STATUS, c.status)}</Badge>
                              </td>
                              <td>{c.result ? <Badge tone={optionTone(CAMPAIGN_RESULT, c.result)}>{optionLabel(CAMPAIGN_RESULT, c.result)}</Badge> : '—'}</td>
                              <td className="whitespace-nowrap text-right">
                                {isAdmin && (
                                  <>
                                    <button
                                      className="btn-icon"
                                      onClick={() => {
                                        setEditing(c)
                                        setFormOpen(true)
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button className="btn-icon hover:text-red-600" onClick={() => void remove(c)}>
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
            </>
          )}

          {tab === 'analisis' && (
            <div className="space-y-6">
              <Card title="Resultados por plataforma" bodyClass="p-0">
                {analysis.length === 0 ? (
                  <EmptyState title="Aún no hay datos" text="Registra campañas con su gasto y resultados." />
                ) : (
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Plataforma</th>
                        <th className="text-right">Campañas</th>
                        <th className="text-right">Gasto</th>
                        <th className="text-right">Leads</th>
                        <th className="text-right">Costo por lead</th>
                        <th className="text-right">Ventas</th>
                        <th className="text-right">Ingresos</th>
                        <th className="text-right">Retorno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.map(([p, a]) => {
                        const r = roi({ spent: a.spent, revenue: a.revenue })
                        return (
                          <tr key={p}>
                            <td className="font-semibold">{p}</td>
                            <td className="text-right">{a.count}</td>
                            <td className="text-right">{fmtMoney(a.spent)}</td>
                            <td className="text-right">{a.leads}</td>
                            <td className="text-right">{a.leads ? fmtMoney(a.spent / a.leads) : '—'}</td>
                            <td className="text-right">{a.sales}</td>
                            <td className="text-right">{fmtMoney(a.revenue)}</td>
                            <td className={`text-right font-bold ${r === null ? 'text-slate-400' : r >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{r === null ? '—' : `${r.toFixed(0)}%`}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {(['funciono', 'regular', 'no_funciono'] as const).map((res) => {
                  const list = campaigns.filter((c) => c.result === res)
                  return (
                    <Card key={res} title={`${optionLabel(CAMPAIGN_RESULT, res)} (${list.length})`}>
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-500">Sin campañas.</p>
                      ) : (
                        <ul className="space-y-3">
                          {list.map((c) => (
                            <li key={c.id}>
                              <p className="text-sm font-semibold">{c.name}</p>
                              <p className="text-xs text-slate-500">
                                {c.platform} · {fmtMoney(c.spent)} · {c.sales} venta(s)
                              </p>
                              {c.notes && <p className="mt-0.5 text-xs text-slate-400">{c.notes}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  )
                })}
              </div>
              <Card title="Planificación: campañas planeadas">
                {campaigns.filter((c) => c.status === 'planeada').length === 0 ? (
                  <p className="text-sm text-slate-500">No hay campañas planeadas.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {campaigns
                      .filter((c) => c.status === 'planeada')
                      .sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'))
                      .map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div>
                            <p className="text-sm font-semibold">{c.name}</p>
                            <p className="text-xs text-slate-500">
                              {c.platform || 'Sin plataforma'} · Presupuesto {fmtMoney(c.budget)}
                            </p>
                            {c.strategy && <p className="text-xs text-slate-400">{c.strategy}</p>}
                          </div>
                          <span className="text-sm text-slate-600">{c.start_date ? fmtDate(c.start_date) : 'Sin fecha'}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {tab === 'ideas' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {(['publicidad', 'innovacion'] as const).map((kind) => {
                const list = ideas.filter((c) => c.kind === kind)
                return (
                  <Card
                    key={kind}
                    title={kind === 'publicidad' ? 'Ideas de publicidad' : 'Innovación'}
                    actions={
                      isAdmin && (
                        <button className="btn-ghost btn-sm" onClick={() => openNew(kind, 'idea')}>
                          <Plus className="h-4 w-4" /> Agregar
                        </button>
                      )
                    }
                  >
                    {list.length === 0 ? (
                      <p className="text-sm text-slate-500">Sin ideas registradas.</p>
                    ) : (
                      <ul className="space-y-3">
                        {list.map((c) => (
                          <li key={c.id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex gap-2">
                                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                <div>
                                  <p className="text-sm font-semibold">{c.name}</p>
                                  <p className="text-xs text-slate-500">
                                    Costo: {fmtMoney(c.budget)} · Inicio: {c.start_date ? fmtDate(c.start_date) : 'por definir'}
                                  </p>
                                  {c.strategy && <p className="mt-1 text-xs text-slate-500">{c.strategy}</p>}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex shrink-0">
                                  <button className="btn-ghost btn-sm" onClick={() => void promote(c)}>
                                    Planear
                                  </button>
                                  <button
                                    className="btn-icon"
                                    onClick={() => {
                                      setEditing(c)
                                      setFormOpen(true)
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button className="btn-icon hover:text-red-600" onClick={() => void remove(c)}>
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <CampaignForm open={formOpen} onClose={() => setFormOpen(false)} campaign={editing} defaults={newKind} onSaved={() => void q.reload()} />
    </div>
  )
}

type CampaignState = Omit<AdCampaign, 'id' | 'created_at' | 'updated_at' | 'budget' | 'spent' | 'reach' | 'leads' | 'sales' | 'revenue' | 'start_date' | 'end_date'> & {
  budget: string
  spent: string
  reach: string
  leads: string
  sales: string
  revenue: string
  start_date: string
  end_date: string
}

function CampaignForm({
  open,
  onClose,
  campaign,
  defaults,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  campaign: AdCampaign | null
  defaults: { kind: AdCampaign['kind']; status: AdCampaign['status'] }
  onSaved: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState<CampaignState | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? campaign?.id ?? `new-${defaults.kind}-${defaults.status}` : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      const c = campaign
      setF({
        kind: c?.kind ?? defaults.kind,
        name: c?.name ?? '',
        platform: c?.platform ?? '',
        objective: c?.objective ?? '',
        strategy: c?.strategy ?? '',
        start_date: c?.start_date ?? '',
        end_date: c?.end_date ?? '',
        budget: c ? String(c.budget) : '',
        spent: c ? String(c.spent) : '',
        reach: c ? String(c.reach) : '',
        leads: c ? String(c.leads) : '',
        sales: c ? String(c.sales) : '',
        revenue: c ? String(c.revenue) : '',
        status: c?.status ?? defaults.status,
        result: c?.result ?? null,
        notes: c?.notes ?? '',
      })
    }
  }
  if (!f) return null
  const set = <K extends keyof CampaignState>(k: K, v: CampaignState[K]) => setF((p) => (p ? { ...p, [k]: v } : p))
  const isIdea = f.status === 'idea'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Escribe el nombre.')
    const n = (v: string, int = false) => {
      const x = Number(v || 0)
      if (!Number.isFinite(x) || x < 0) return 0
      return int ? Math.round(x) : x
    }
    setSaving(true)
    try {
      const payload = {
        ...f,
        name: f.name.trim(),
        start_date: f.start_date || null,
        end_date: f.end_date || null,
        budget: n(f.budget),
        spent: n(f.spent),
        reach: n(f.reach, true),
        leads: n(f.leads, true),
        sales: n(f.sales, true),
        revenue: n(f.revenue),
      }
      if (campaign) await must(supabase.from('ad_campaigns').update(payload).eq('id', campaign.id).select('id').single())
      else await must(supabase.from('ad_campaigns').insert(payload).select('id').single())
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
      title={campaign ? 'Editar' : isIdea ? 'Nueva idea' : 'Nueva campaña'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="camp-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="camp-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={isIdea ? 'Idea' : 'Nombre de la campaña'} required className="sm:col-span-2">
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Tipo">
          <select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value as AdCampaign['kind'])}>
            <option value="publicidad">Publicidad</option>
            <option value="innovacion">Innovación</option>
          </select>
        </Field>
        <Field label="Estatus">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as AdCampaign['status'])}>
            {CAMPAIGN_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plataforma / medio">
          <input className="input" list="ad-platforms" value={f.platform} onChange={(e) => set('platform', e.target.value)} />
          <datalist id="ad-platforms">
            {AD_PLATFORMS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Objetivo">
          <input className="input" value={f.objective} onChange={(e) => set('objective', e.target.value)} placeholder="Ej. XV años temporada 2027" />
        </Field>
        <Field label="Estrategia / descripción" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={f.strategy} onChange={(e) => set('strategy', e.target.value)} />
        </Field>
        <Field label="Fecha de inicio">
          <input className="input" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="Fecha de fin">
          <input className="input" type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </Field>
        <Field label={isIdea ? 'Costo estimado' : 'Presupuesto'}>
          <input className="input" type="number" min="0" step="0.01" value={f.budget} onChange={(e) => set('budget', e.target.value)} />
        </Field>
        {!isIdea && (
          <>
            <Field label="Gasto real">
              <input className="input" type="number" min="0" step="0.01" value={f.spent} onChange={(e) => set('spent', e.target.value)} />
            </Field>
            <Field label="Alcance (personas)">
              <input className="input" type="number" min="0" value={f.reach} onChange={(e) => set('reach', e.target.value)} />
            </Field>
            <Field label="Prospectos (mensajes / leads)">
              <input className="input" type="number" min="0" value={f.leads} onChange={(e) => set('leads', e.target.value)} />
            </Field>
            <Field label="Ventas logradas">
              <input className="input" type="number" min="0" value={f.sales} onChange={(e) => set('sales', e.target.value)} />
            </Field>
            <Field label="Ingresos por esas ventas">
              <input className="input" type="number" min="0" step="0.01" value={f.revenue} onChange={(e) => set('revenue', e.target.value)} />
            </Field>
            <Field label="¿Funcionó?">
              <select className="input" value={f.result ?? ''} onChange={(e) => set('result', (e.target.value || null) as AdCampaign['result'])}>
                <option value="">— Por evaluar —</option>
                {CAMPAIGN_RESULT.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Notas / aprendizajes" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

function Moodboard() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [board, setBoard] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [newBoard, setNewBoard] = useState('')
  const [viewing, setViewing] = useState<MoodboardItem | null>(null)
  const q = useQuery(() => must<MoodboardItem[]>(supabase.from('moodboard_items').select('*').order('created_at', { ascending: false })), [])

  const boards = useMemo(() => Array.from(new Set((q.data ?? []).map((i) => i.board))).sort(), [q.data])
  const items = (q.data ?? []).filter((i) => !board || i.board === board)

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return
    const target = (newBoard.trim() || board || 'General').trim()
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const err = validateImage(file)
        if (err) {
          toast.error(`${file.name}: ${err}`)
          continue
        }
        const path = await uploadFile('media', 'moodboard', await compressImage(file), file.name)
        await must(supabase.from('moodboard_items').insert({ board: target, title: file.name.replace(/\.[^.]+$/, ''), image_path: path }).select('id').single())
      }
      setNewBoard('')
      setBoard(target)
      toast.success('Imágenes agregadas')
      void q.reload()
    } catch (e) {
      toast.error(e)
    } finally {
      setUploading(false)
    }
  }

  const remove = async (i: MoodboardItem) => {
    if (!(await confirm({ title: 'Eliminar imagen', text: '¿Eliminar esta imagen del moodboard?' }))) return
    try {
      await must(supabase.from('moodboard_items').delete().eq('id', i.id).select('id'))
      await removeFile('media', i.image_path)
      setViewing(null)
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  const saveItem = async (i: MoodboardItem) => {
    try {
      await must(supabase.from('moodboard_items').update({ title: i.title, notes: i.notes, board: i.board || 'General' }).eq('id', i.id).select('id').single())
      toast.success('Guardado')
      setViewing(null)
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error) return <ErrorBlock message={q.error} onRetry={q.reload} />

  return (
    <div>
      <div className="card mb-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button className={`btn-sm rounded-full ${!board ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setBoard('')}>
            Todos
          </button>
          {boards.map((b) => (
            <button key={b} className={`btn-sm rounded-full ${board === b ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setBoard(b)}>
              {b}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="input sm:w-52" placeholder={board ? `Tablero: ${board}` : 'Nombre del tablero'} value={newBoard} onChange={(e) => setNewBoard(e.target.value)} />
            <label className="btn-primary cursor-pointer">
              <ImagePlus className="h-4 w-4" /> {uploading ? 'Subiendo…' : 'Subir imágenes'}
              <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => void upload(e.target.files)} />
            </label>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="Moodboard vacío" text="Sube imágenes de referencia para planear tu publicidad, sesiones y estilos." />
        </div>
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {items.map((i) => (
            <button key={i.id} className="group mb-4 block w-full break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white text-left" onClick={() => setViewing(i)}>
              <img src={publicUrl(i.image_path)} alt={i.title} className="w-full object-cover transition group-hover:opacity-90" loading="lazy" />
              {(i.title || i.notes) && (
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-slate-700">{i.title}</p>
                  {i.notes && <p className="line-clamp-2 text-xs text-slate-400">{i.notes}</p>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {viewing && (
        <Modal
          open
          onClose={() => setViewing(null)}
          title={viewing.title || 'Imagen'}
          size="lg"
          footer={
            isAdmin ? (
              <>
                <button className="btn-danger mr-auto" onClick={() => void remove(viewing)}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
                <button className="btn-primary" onClick={() => void saveItem(viewing)}>
                  Guardar
                </button>
              </>
            ) : undefined
          }
        >
          <img src={publicUrl(viewing.image_path)} alt={viewing.title} className="mx-auto mb-4 max-h-[55vh] rounded-lg object-contain" />
          {isAdmin ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Título">
                <input className="input" value={viewing.title} onChange={(e) => setViewing({ ...viewing, title: e.target.value })} />
              </Field>
              <Field label="Tablero">
                <input className="input" value={viewing.board} onChange={(e) => setViewing({ ...viewing, board: e.target.value })} />
              </Field>
              <Field label="Notas" className="sm:col-span-2">
                <textarea className="input" value={viewing.notes} onChange={(e) => setViewing({ ...viewing, notes: e.target.value })} />
              </Field>
            </div>
          ) : (
            <p className="text-sm text-slate-600">{viewing.notes}</p>
          )}
        </Modal>
      )}
    </div>
  )
}
