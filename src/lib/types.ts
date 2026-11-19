// Tipos de datos del sistema STEFF (coinciden con supabase/01_esquema.sql)

export type Role = 'admin' | 'colaborador'

export interface Profile {
  id: string
  username: string
  full_name: string
  role: Role
  active: boolean
  created_at: string
}

export interface Settings {
  id: number
  business_name: string
  city: string
  representative_name: string
  phone: string
  email: string
  address: string
  whatsapp_country_code: string
  updated_at: string
}

export type ClientStatus = 'prospecto' | 'activo' | 'recurrente' | 'inactivo'

export interface Client {
  id: string
  full_name: string
  phone: string
  email: string
  address: string
  city: string
  source: string
  status: ClientStatus
  birthday: string | null
  notes: string
  client_since: string
  created_at: string
  updated_at: string
}

export interface ClientNote {
  id: string
  client_id: string
  body: string
  created_by: string | null
  created_at: string
}

export type StaffStatus = 'activo' | 'inactivo' | 'vacaciones'

export interface Staff {
  id: string
  full_name: string
  phone: string
  email: string
  roles: string[]
  status: StaffStatus
  address: string
  birth_date: string | null
  emergency_contact: string
  emergency_phone: string
  bank_name: string
  bank_account: string
  rate_notes: string
  equipment_notes: string
  notes: string
  photo_path: string | null
  created_at: string
  updated_at: string
}

export type EventStatus = 'cotizacion' | 'confirmado' | 'realizado' | 'en_edicion' | 'entregado' | 'cancelado'
export type DeliveryType = 'normal' | 'express1' | 'express2'

export interface EventRow {
  id: string
  project_number: string
  client_id: string
  event_type: string
  main_names: string
  event_date: string
  status: EventStatus
  package: string
  services: string[]
  total_amount: number
  seller_id: string | null
  address: string
  sesion_place: string
  sesion_maps_url: string
  sesion_start: string | null
  sesion_end: string | null
  misa_place: string
  misa_maps_url: string
  misa_start: string | null
  misa_end: string | null
  evento_place: string
  evento_maps_url: string
  evento_start: string | null
  evento_end: string | null
  delivery_type: DeliveryType
  print_service: string
  notes: string
  created_at: string
  updated_at: string
}

export interface EventWithClient extends EventRow {
  clients: Pick<Client, 'id' | 'full_name' | 'phone'> | null
}

export type PaymentConcept = 'anticipo' | 'abono' | 'liquidacion' | 'extra'

export interface EventPayment {
  id: string
  event_id: string
  concept: PaymentConcept
  amount: number
  paid_on: string
  method: string
  notes: string
  created_at: string
}

export interface GuideRow {
  item: string
  note: string
  spec: string
}

export interface GuideSection {
  title: string
  rows: GuideRow[]
}

export interface GuideContent {
  work_type: string
  format: string
  photo_qty: string
  video_qty: string
  delivery_text: string
  delivery_platform: string
  delivery_link: string
  guide_note: string
  column_label: string
  sections: GuideSection[]
  include_family: boolean
  final_note: string
  extra_notes?: string
}

export interface Assignment {
  id: string
  event_id: string
  staff_id: string
  role: string
  payment: number
  paid: boolean
  paid_on: string | null
  notes: string
  guide: GuideContent | null
  guide_sent_at: string | null
  created_at: string
}

export interface AssignmentWithStaff extends Assignment {
  staff: Pick<Staff, 'id' | 'full_name' | 'phone' | 'roles'> | null
}

export interface FamilyMember {
  id: string
  event_id: string
  name: string
  relationship: string
  notes: string
  photo_path: string | null
  created_at: string
}

export type EquipmentStatus = 'disponible' | 'en_uso' | 'mantenimiento' | 'baja'

export interface Equipment {
  id: string
  name: string
  category: string
  brand: string
  model: string
  serial: string
  status: EquipmentStatus
  notes: string
  created_at: string
}

export interface EquipmentCheckout {
  id: string
  equipment_id: string
  event_id: string | null
  staff_id: string | null
  out_at: string
  due_back: string | null
  returned_at: string | null
  condition_out: string
  condition_in: string
  notes: string
  created_at: string
}

export type BackupStatus = 'pendiente' | 'respaldado' | 'incompleto' | 'eliminado'

export interface Backup {
  id: string
  event_id: string
  service: string
  location: string
  folder_name: string
  status: BackupStatus
  backed_up_on: string | null
  notes: string
  created_at: string
}

export type DeliveryStatus = 'pendiente' | 'en_edicion' | 'seleccion_cliente' | 'listo' | 'entregado'

export interface Delivery {
  id: string
  event_id: string
  service: string
  status: DeliveryStatus
  editor_id: string | null
  edit_day: string
  due_date: string | null
  delivered_on: string | null
  method: string
  link: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  name: string
  category: string
  contact_name: string
  phone: string
  email: string
  address: string
  website: string
  products: string
  payment_terms: string
  status: 'activo' | 'inactivo'
  notes: string
  created_at: string
}

export interface Expense {
  id: string
  event_id: string | null
  supplier_id: string | null
  category: string
  concept: string
  amount: number
  expense_date: string
  paid: boolean
  paid_on: string | null
  notes: string
  created_at: string
}

export type ContractBlockType =
  | 'datos'
  | 'paquete'
  | 'horarios'
  | 'plan_pagos'
  | 'tiempo_entrega'
  | 'notas'
  | 'firmas'
  | 'clausulas'
  | 'texto'

export interface DeliveryOption {
  name: string
  time: string
  price: string
}

export interface ContractBlock {
  id: string
  type: ContractBlockType
  enabled: boolean
  title: string
  items?: string[]
  options?: DeliveryOption[]
  body?: string
  new_page?: boolean
}

export interface ContractTemplateContent {
  title: string
  city_line: string
  representative: string
  show_logo: boolean
  blocks: ContractBlock[]
}

export interface ContractTemplate {
  id: string
  name: string
  is_default: boolean
  content: ContractTemplateContent
  logo_path: string | null
  created_at: string
  updated_at: string
}

export interface ScheduleSlot {
  place: string
  time: string
}

export interface ContractPaymentRow {
  concept: string
  amount: number
  date: string
}

export interface ExtraSection {
  title: string
  body: string
}

export interface ContractData {
  contract_date: string
  event_type: string
  event_date: string
  client_name: string
  main_names: string
  address: string
  contact: string
  package: string
  schedule: { sesion: ScheduleSlot; misa: ScheduleSlot; evento: ScheduleSlot }
  payments: ContractPaymentRow[]
  total: number
  delivery_type: DeliveryType
  extra_sections: ExtraSection[]
  template: ContractTemplateContent
  logo_path: string | null
}

export type ContractStatus = 'borrador' | 'enviado' | 'firmado' | 'cancelado'

export interface Contract {
  id: string
  folio: number
  event_id: string | null
  client_id: string | null
  template_id: string | null
  contract_date: string
  status: ContractStatus
  data: ContractData
  pdf_path: string | null
  created_at: string
  updated_at: string
}

export interface GuideTemplate {
  id: string
  name: string
  is_default: boolean
  content: GuideContent
  created_at: string
  updated_at: string
}

export interface AdCampaign {
  id: string
  kind: 'publicidad' | 'innovacion'
  name: string
  platform: string
  objective: string
  strategy: string
  start_date: string | null
  end_date: string | null
  budget: number
  spent: number
  reach: number
  leads: number
  sales: number
  revenue: number
  status: 'idea' | 'planeada' | 'activa' | 'finalizada'
  result: 'funciono' | 'regular' | 'no_funciono' | null
  notes: string
  created_at: string
  updated_at: string
}

export interface MoodboardItem {
  id: string
  board: string
  title: string
  notes: string
  image_path: string
  created_at: string
}

export interface WaMessage {
  id: string
  client_id: string | null
  message: string
  image_path: string | null
  sent_by: string | null
  sent_at: string
}

export interface EventFinance {
  event_id: string
  total_amount: number
  paid: number
  balance: number
  team_cost: number
  team_unpaid: number
  other_cost: number
  other_unpaid: number
  investment: number
  profit: number
}
