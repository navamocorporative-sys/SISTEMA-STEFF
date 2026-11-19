import type {
  BackupStatus,
  ClientStatus,
  ContractStatus,
  DeliveryStatus,
  DeliveryType,
  EquipmentStatus,
  EventStatus,
  PaymentConcept,
  StaffStatus,
} from './types'

export type Tone = 'gray' | 'blue' | 'navy' | 'amber' | 'green' | 'red' | 'violet'

export interface Option<T extends string = string> {
  value: T
  label: string
  tone?: Tone
}

export const EVENT_TYPES = [
  'XV años',
  'Boda',
  'Sesión',
  'Cantamisa',
  'Pastelada',
  'Cumpleaños',
  'Bautizo',
  'Primera comunión',
  'Graduación',
  'Baby shower',
  'Evento corporativo',
  'Otro',
]

export const SERVICES: Option[] = [
  { value: 'fotografia', label: 'Fotografía' },
  { value: 'video', label: 'Video' },
  { value: 'dron', label: 'Dron' },
  { value: 'impresion', label: 'Impresión' },
]

export const BACKUP_SERVICES: Option[] = [{ value: 'general', label: 'General' }, ...SERVICES]

export const STAFF_ROLES = [
  'Fotógrafo',
  'Videógrafo',
  'Dron',
  'Editor de foto',
  'Editor de video',
  'Vendedor',
  'Asistente',
]

export const EVENT_STATUS: Option<EventStatus>[] = [
  { value: 'cotizacion', label: 'Cotización', tone: 'gray' },
  { value: 'confirmado', label: 'Confirmado', tone: 'blue' },
  { value: 'realizado', label: 'Realizado', tone: 'violet' },
  { value: 'en_edicion', label: 'En edición', tone: 'amber' },
  { value: 'entregado', label: 'Entregado', tone: 'green' },
  { value: 'cancelado', label: 'Cancelado', tone: 'red' },
]

export const DELIVERY_STATUS: Option<DeliveryStatus>[] = [
  { value: 'pendiente', label: 'Pendiente', tone: 'gray' },
  { value: 'en_edicion', label: 'En edición', tone: 'amber' },
  { value: 'seleccion_cliente', label: 'Selección del cliente', tone: 'violet' },
  { value: 'listo', label: 'Listo para entregar', tone: 'blue' },
  { value: 'entregado', label: 'Entregado', tone: 'green' },
]

export const BACKUP_STATUS: Option<BackupStatus>[] = [
  { value: 'pendiente', label: 'Pendiente', tone: 'amber' },
  { value: 'respaldado', label: 'Respaldado', tone: 'green' },
  { value: 'incompleto', label: 'Incompleto', tone: 'red' },
  { value: 'eliminado', label: 'Eliminado', tone: 'gray' },
]

export const BACKUP_LOCATIONS = ['Disco duro', 'MAC', 'Memoria', 'Memoria / Disco duro', 'Disco duro / MAC', 'Nube']

export const DELIVERY_METHODS = ['TransferNow', 'Google Drive', 'WeTransfer', 'USB', 'Impreso', 'Otro']

export const DELIVERY_TYPES: Option<DeliveryType>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'express1', label: 'Express 1' },
  { value: 'express2', label: 'Express 2' },
]

export const CLIENT_STATUS: Option<ClientStatus>[] = [
  { value: 'prospecto', label: 'Prospecto', tone: 'gray' },
  { value: 'activo', label: 'Activo', tone: 'blue' },
  { value: 'recurrente', label: 'Recurrente', tone: 'green' },
  { value: 'inactivo', label: 'Inactivo', tone: 'red' },
]

export const CLIENT_SOURCES = ['Facebook', 'Instagram', 'TikTok', 'WhatsApp', 'Recomendación', 'Google', 'Expo', 'Otro']

export const STAFF_STATUS: Option<StaffStatus>[] = [
  { value: 'activo', label: 'Activo', tone: 'green' },
  { value: 'vacaciones', label: 'Vacaciones', tone: 'amber' },
  { value: 'inactivo', label: 'Inactivo', tone: 'gray' },
]

export const PAYMENT_CONCEPTS: Option<PaymentConcept>[] = [
  { value: 'anticipo', label: 'Anticipo' },
  { value: 'abono', label: 'Abono' },
  { value: 'liquidacion', label: 'Liquidación' },
  { value: 'extra', label: 'Extra' },
]

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Depósito', 'Otro']

export const EQUIPMENT_STATUS: Option<EquipmentStatus>[] = [
  { value: 'disponible', label: 'Disponible', tone: 'green' },
  { value: 'en_uso', label: 'En uso', tone: 'blue' },
  { value: 'mantenimiento', label: 'Mantenimiento', tone: 'amber' },
  { value: 'baja', label: 'Baja', tone: 'gray' },
]

export const EQUIPMENT_CATEGORIES = ['Cámara', 'Lente', 'Dron', 'Iluminación', 'Audio', 'Tripié / Estabilizador', 'Memoria / Batería', 'Impresión', 'Otro']

/** Gastos de evento que no son pagos al equipo (como en el Excel de ventas). */
export const EVENT_EXPENSE_CATEGORIES = ['Gasolina', 'Comida', 'Proveedores fotografía', 'Impresión', 'Renta de equipo', 'Extras', 'Otro']

/** Gastos generales del negocio / proveedores */
export const GENERAL_EXPENSE_CATEGORIES = [
  'Proveedores fotografía',
  'Impresión',
  'Equipo',
  'Renta de equipo',
  'Software / Suscripciones',
  'Renta / Servicios',
  'Gasolina',
  'Comida',
  'Extras',
  'Otro',
]

export const SUPPLIER_CATEGORIES = ['Impresión', 'Marcos y ampliaciones', 'Equipo', 'Renta de equipo', 'Laboratorio', 'Software', 'Transporte', 'Otro']

export const CONTRACT_STATUS: Option<ContractStatus>[] = [
  { value: 'borrador', label: 'Borrador', tone: 'gray' },
  { value: 'enviado', label: 'Enviado', tone: 'blue' },
  { value: 'firmado', label: 'Firmado', tone: 'green' },
  { value: 'cancelado', label: 'Cancelado', tone: 'red' },
]

export const AD_PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'Google', 'WhatsApp', 'Volantes', 'Expo', 'Radio', 'Otro']

export const CAMPAIGN_STATUS: Option<'idea' | 'planeada' | 'activa' | 'finalizada'>[] = [
  { value: 'idea', label: 'Idea', tone: 'gray' },
  { value: 'planeada', label: 'Planeada', tone: 'violet' },
  { value: 'activa', label: 'Activa', tone: 'blue' },
  { value: 'finalizada', label: 'Finalizada', tone: 'navy' },
]

export const CAMPAIGN_RESULT: Option<'funciono' | 'regular' | 'no_funciono'>[] = [
  { value: 'funciono', label: 'Funcionó', tone: 'green' },
  { value: 'regular', label: 'Regular', tone: 'amber' },
  { value: 'no_funciono', label: 'No funcionó', tone: 'red' },
]

export function optionLabel<T extends string>(opts: Option<T>[], value: T | null | undefined): string {
  return opts.find((o) => o.value === value)?.label ?? (value ?? '')
}

export function optionTone<T extends string>(opts: Option<T>[], value: T | null | undefined): Tone {
  return opts.find((o) => o.value === value)?.tone ?? 'gray'
}

export function serviceLabel(v: string): string {
  return BACKUP_SERVICES.find((s) => s.value === v)?.label ?? v
}
