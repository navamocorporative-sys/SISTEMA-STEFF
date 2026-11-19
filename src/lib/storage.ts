import { supabase } from './supabase'

export type Bucket = 'media' | 'documentos'

function safeName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'archivo'
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Sube un archivo y regresa la ruta guardada. */
export async function uploadFile(bucket: Bucket, folder: string, file: Blob, fileName: string): Promise<string> {
  const path = `${folder}/${randomId()}-${safeName(fileName)}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error
  return path
}

export function publicUrl(path: string | null | undefined): string {
  if (!path) return ''
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

/** Enlace temporal para un documento privado (por defecto 30 días). */
export async function signedUrl(path: string, seconds = 60 * 60 * 24 * 30): Promise<string> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}

export async function removeFile(bucket: Bucket, path: string | null | undefined): Promise<void> {
  if (!path) return
  await supabase.storage.from(bucket).remove([path])
}

const MAX_IMAGE_MB = 10

export function validateImage(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'El archivo debe ser una imagen (JPG, PNG, WEBP).'
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `La imagen pesa más de ${MAX_IMAGE_MB} MB.`
  return null
}

/** Reduce imágenes grandes antes de subirlas (máx. 1600 px). */
export async function compressImage(file: File, maxSize = 1600): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

/** Descarga una imagen y la convierte a data URL (para insertarla en PDFs). */
export async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    const max = 800
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } catch {
    return null
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
