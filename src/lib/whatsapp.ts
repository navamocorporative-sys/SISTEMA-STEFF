import { cleanPhone } from './format'

/** Normaliza un teléfono de México (10 dígitos) agregando la lada del país. */
export function waPhone(phone: string, countryCode = '52'): string {
  const digits = cleanPhone(phone)
  if (!digits) return ''
  if (digits.length === 10) return countryCode + digits
  return digits
}

export function waLink(phone: string, message: string, countryCode = '52'): string {
  const p = waPhone(phone, countryCode)
  const text = encodeURIComponent(message)
  return p ? `https://wa.me/${p}?text=${text}` : `https://wa.me/?text=${text}`
}

export function openWhatsApp(phone: string, message: string, countryCode = '52'): void {
  window.open(waLink(phone, message, countryCode), '_blank', 'noopener,noreferrer')
}

/** Intenta compartir un archivo directamente (celulares). Regresa true si se compartió. */
export async function shareFile(blob: Blob, fileName: string, text: string): Promise<boolean> {
  try {
    const file = new File([blob], fileName, { type: blob.type || 'application/pdf' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], text, title: fileName })
      return true
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return true
  }
  return false
}

/**
 * Abre WhatsApp con un mensaje que se prepara de forma asíncrona (por ejemplo,
 * después de generar y subir un PDF). La ventana se abre de inmediato para que
 * el navegador no la bloquee.
 */
export async function sendViaWhatsApp(phone: string, buildMessage: () => Promise<string>, countryCode = '52'): Promise<void> {
  const win = window.open('about:blank', '_blank')
  try {
    const msg = await buildMessage()
    const url = waLink(phone, msg, countryCode)
    if (win && !win.closed) win.location.href = url
    else window.open(url, '_blank')
  } catch (e) {
    win?.close()
    throw e
  }
}
