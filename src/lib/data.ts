import { supabase, must } from './supabase'
import { DEFAULT_CONTRACT, DEFAULT_GUIDE } from './defaults'
import type {
  Client,
  ContractTemplate,
  EventFinance,
  EventWithClient,
  GuideContent,
  GuideTemplate,
  Staff,
} from './types'

export const EVENT_SELECT = '*, clients(id, full_name, phone)'

export async function listClients(): Promise<Client[]> {
  return must(supabase.from('clients').select('*').order('full_name'))
}

export async function listStaff(): Promise<Staff[]> {
  return must(supabase.from('staff').select('*').order('full_name'))
}

export async function listEvents(): Promise<EventWithClient[]> {
  return must(supabase.from('events').select(EVENT_SELECT).order('event_date', { ascending: false }))
}

export async function listEventFinance(): Promise<Map<string, EventFinance>> {
  const rows = await must<EventFinance[]>(supabase.from('event_finance').select('*'))
  return new Map(rows.map((r) => [r.event_id, r]))
}

export async function getDefaultGuide(): Promise<GuideContent> {
  const { data } = await supabase.from('guide_templates').select('*').eq('is_default', true).maybeSingle()
  const tpl = data as GuideTemplate | null
  return cloneGuide(tpl?.content ?? DEFAULT_GUIDE)
}

export async function listContractTemplates(): Promise<ContractTemplate[]> {
  return must(supabase.from('contract_templates').select('*').order('is_default', { ascending: false }).order('name'))
}

export function cloneGuide(g: GuideContent): GuideContent {
  const base = JSON.parse(JSON.stringify(DEFAULT_GUIDE)) as GuideContent
  const copy = JSON.parse(JSON.stringify(g)) as Partial<GuideContent>
  return { ...base, ...copy, sections: copy.sections ?? base.sections }
}

export function cloneContractTemplate(c: ContractTemplate['content'] | null | undefined) {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONTRACT)) as ContractTemplate['content']
  if (!c) return base
  const copy = JSON.parse(JSON.stringify(c)) as Partial<ContractTemplate['content']>
  return { ...base, ...copy, blocks: copy.blocks ?? base.blocks }
}

/** Genera un número de proyecto único (AAMMDD, y si ya existe, AAMMDD-2, -3…). */
export async function uniqueProjectNumber(base: string, excludeId?: string): Promise<string> {
  if (!base) return base
  const rows = await must<{ id: string; project_number: string }[]>(
    supabase.from('events').select('id, project_number').like('project_number', `${base}%`),
  )
  const taken = new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.project_number))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/** Fecha límite sugerida para la entrega según el tipo de entrega del contrato. */
export function suggestedDueDate(eventDate: string, deliveryType: string): string {
  const d = new Date(`${eventDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  if (deliveryType === 'express1') d.setDate(d.getDate() + 7)
  else if (deliveryType === 'express2') d.setDate(d.getDate() + 3)
  else d.setMonth(d.getMonth() + 2)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
