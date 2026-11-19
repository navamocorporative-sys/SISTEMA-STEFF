import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey && !url.includes('TU-PROYECTO'))

export const supabase = createClient(isConfigured ? url : 'http://localhost', isConfigured ? anonKey : 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Dominio interno: el usuario escribe "admin" y se convierte en "admin@steff.app". */
export const USER_DOMAIN = 'steff.app'

export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${USER_DOMAIN}`
}

interface PgLikeError {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** Convierte errores técnicos en mensajes claros en español. */
export function friendlyError(err: unknown): string {
  if (!err) return 'Ocurrió un error inesperado.'
  const e = err as PgLikeError
  const msg = (e.message ?? String(err)).trim()
  switch (e.code) {
    case '23503':
      return 'No se puede completar: este registro está relacionado con otra información (por ejemplo, eventos o asignaciones). Elimina o cambia primero lo relacionado.'
    case '23505':
      return 'Ya existe un registro con ese mismo dato (por ejemplo, el número de proyecto o el usuario).'
    case '23514':
      return 'Algún valor no es válido. Revisa montos y campos obligatorios.'
    case '42501':
      return 'No tienes permiso para realizar esta acción. Solo el administrador puede hacerlo.'
    case 'PGRST116':
      return 'No se encontró el registro.'
    default:
      break
  }
  if (/row-level security/i.test(msg)) return 'No tienes permiso para realizar esta acción. Solo el administrador puede hacerlo.'
  if (/Invalid login credentials/i.test(msg)) return 'Usuario o contraseña incorrectos.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  if (/JWT expired/i.test(msg)) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  return msg || 'Ocurrió un error inesperado.'
}

/** Lanza un error si la respuesta de Supabase trae error; regresa los datos. */
export async function must<T = unknown>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}
