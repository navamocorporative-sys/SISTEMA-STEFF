import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Download, FilePlus2, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchInput, Tabs } from '../../components/ui'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { cloneContractTemplate, listContractTemplates } from '../../lib/data'
import { CONTRACT_STATUS, optionLabel, optionTone } from '../../lib/constants'
import { fmtDate, fmtMoney } from '../../lib/format'
import { buildContractPdf } from '../../lib/pdf/contractPdf'
import { fileSafe } from '../../lib/pdf/engine'
import { downloadBlob } from '../../lib/storage'
import type { Contract, ContractStatus, ContractTemplate } from '../../lib/types'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

type TabKey = 'contratos' | 'plantillas'

export default function ContractsPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<TabKey>('contratos')
  return (
    <div>
      <PageHeader
        title="Contratos"
        subtitle="Crea contratos que se llenan solos con los datos del cliente y del evento, descárgalos en PDF y envíalos por WhatsApp."
        actions={
          isAdmin && (
            <Link className="btn-primary" to="/contratos/nuevo">
              <Plus className="h-4 w-4" /> Nuevo contrato
            </Link>
          )
        }
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'contratos', label: 'Contratos' },
          { value: 'plantillas', label: 'Creación de nuevo contrato (plantillas)', hidden: !isAdmin },
        ]}
      />
      {tab === 'contratos' ? <ContractList /> : <TemplateList />}
    </div>
  )
}

function ContractList() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ContractStatus | ''>('')
  const [busy, setBusy] = useState<string | null>(null)
  const q = useQuery(() => must<Contract[]>(supabase.from('contracts').select('*').order('created_at', { ascending: false })), [])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    let list = q.data ?? []
    if (status) list = list.filter((c) => c.status === status)
    if (s) list = list.filter((c) => `${c.data.client_name} ${c.data.event_type} ${c.folio}`.toLowerCase().includes(s))
    return list
  }, [q.data, search, status])

  const pdf = async (c: Contract) => {
    setBusy(c.id)
    try {
      downloadBlob(await buildContractPdf(c.data, c.folio), `Contrato_${String(c.folio).padStart(4, '0')}_${fileSafe(c.data.client_name)}.pdf`)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (c: Contract) => {
    if (!(await confirm({ title: 'Eliminar contrato', text: `¿Eliminar el contrato ${String(c.folio).padStart(4, '0')} de ${c.data.client_name}?` }))) return
    try {
      await must(supabase.from('contracts').delete().eq('id', c.id).select('id'))
      toast.success('Contrato eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="card">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:justify-between">
        <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus | '')}>
          <option value="">Todos los estatus</option>
          {CONTRACT_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Cliente, tipo de evento, folio…" />
      </div>
      {q.loading && !q.data ? (
        <LoadingBlock />
      ) : q.error ? (
        <div className="p-4">
          <ErrorBlock message={q.error} onRetry={q.reload} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Aún no hay contratos"
          action={
            isAdmin && (
              <Link className="btn-primary" to="/contratos/nuevo">
                <Plus className="h-4 w-4" /> Crear contrato
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Evento</th>
                <th className="text-right">Total</th>
                <th>Estatus</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="row-link" onClick={() => navigate(`/contratos/${c.id}`)}>
                  <td className="font-mono text-xs">{String(c.folio).padStart(4, '0')}</td>
                  <td>{fmtDate(c.contract_date)}</td>
                  <td className="font-semibold">{c.data.client_name}</td>
                  <td className="text-sm text-slate-600">
                    {c.data.event_type}
                    {c.data.event_date ? ` · ${fmtDate(c.data.event_date)}` : ''}
                  </td>
                  <td className="text-right">{fmtMoney(c.data.total)}</td>
                  <td>
                    <Badge tone={optionTone(CONTRACT_STATUS, c.status)}>{optionLabel(CONTRACT_STATUS, c.status)}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-icon" onClick={() => void pdf(c)} disabled={busy === c.id} title="Descargar PDF">
                      <Download className="h-4 w-4" />
                    </button>
                    {isAdmin && (
                      <button className="btn-icon hover:text-red-600" onClick={() => void remove(c)} title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TemplateList() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const q = useQuery(listContractTemplates, [])

  const create = async (fromScratch: boolean, source?: ContractTemplate) => {
    try {
      const base = source ? cloneContractTemplate(source.content) : cloneContractTemplate(null)
      const content = fromScratch
        ? {
            ...base,
            blocks: base.blocks.filter((b) => b.type === 'datos' || (b.type === 'firmas' && b.id === 'b-firmas1')),
          }
        : base
      const saved = await must<ContractTemplate>(
        supabase
          .from('contract_templates')
          .insert({ name: source ? `${source.name} (copia)` : fromScratch ? 'Nueva plantilla' : 'Plantilla estándar', is_default: false, content, logo_path: source?.logo_path ?? null })
          .select()
          .single(),
      )
      navigate(`/contratos/plantillas/${saved.id}`)
    } catch (e) {
      toast.error(e)
    }
  }

  const makeDefault = async (t: ContractTemplate) => {
    try {
      await must(supabase.from('contract_templates').update({ is_default: false }).eq('is_default', true).select('id'))
      await must(supabase.from('contract_templates').update({ is_default: true }).eq('id', t.id).select('id').single())
      toast.success(`"${t.name}" ahora es la plantilla predeterminada`)
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  const remove = async (t: ContractTemplate) => {
    if (t.is_default) return toast.error('No puedes eliminar la plantilla predeterminada. Marca otra como predeterminada primero.')
    if (!(await confirm({ title: 'Eliminar plantilla', text: `¿Eliminar la plantilla "${t.name}"? Los contratos ya creados no cambian.` }))) return
    try {
      await must(supabase.from('contract_templates').delete().eq('id', t.id).select('id'))
      toast.success('Plantilla eliminada')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => void create(true)}>
          <FilePlus2 className="h-4 w-4" /> Crear desde cero
        </button>
        {q.data.length === 0 && (
          <button className="btn-secondary" onClick={() => void create(false)}>
            <Plus className="h-4 w-4" /> Crear plantilla estándar
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.data.map((t) => (
          <div key={t.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-navy-900">{t.name}</h3>
              {t.is_default && <Badge tone="green">Predeterminada</Badge>}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t.content.blocks.filter((b) => b.enabled).length} apartados · actualizada {fmtDate(t.updated_at.slice(0, 10))}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" onClick={() => navigate(`/contratos/plantillas/${t.id}`)}>
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button className="btn-ghost btn-sm" onClick={() => void create(false, t)}>
                <Copy className="h-4 w-4" /> Duplicar
              </button>
              {!t.is_default && (
                <button className="btn-ghost btn-sm" onClick={() => void makeDefault(t)}>
                  <Star className="h-4 w-4" /> Predeterminar
                </button>
              )}
              {!t.is_default && (
                <button className="btn-icon hover:text-red-600" onClick={() => void remove(t)} title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
