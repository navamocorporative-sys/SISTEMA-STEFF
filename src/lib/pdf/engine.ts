import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import logoUrl from '../../assets/logo-steff.png'
import { imageToDataUrl } from '../storage'

type PdfMakeLike = {
  vfs: Record<string, string>
  createPdf: (def: TDocumentDefinitions) => { getBlob: (cb: (b: Blob) => void) => void }
}

let loader: Promise<PdfMakeLike> | null = null

function pickVfs(mod: unknown): Record<string, string> {
  const m = mod as Record<string, unknown> & { default?: unknown }
  const candidates: unknown[] = [
    (m as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs,
    (m.default as { pdfMake?: { vfs?: unknown } } | undefined)?.pdfMake?.vfs,
    (m as { vfs?: unknown }).vfs,
    (m.default as { vfs?: unknown } | undefined)?.vfs,
    m.default,
    m,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object' && 'Roboto-Regular.ttf' in (c as Record<string, unknown>)) {
      return c as Record<string, string>
    }
  }
  throw new Error('No se pudieron cargar las fuentes para el PDF.')
}

export function getPdfMake(): Promise<PdfMakeLike> {
  if (!loader) {
    loader = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
      .then(([pm, fonts]) => {
        const pdfMake = ((pm as { default?: unknown }).default ?? pm) as PdfMakeLike
        pdfMake.vfs = pickVfs(fonts)
        return pdfMake
      })
      .catch((e) => {
        loader = null
        throw e
      })
  }
  return loader
}

export async function createPdfBlob(def: TDocumentDefinitions): Promise<Blob> {
  const pdfMake = await getPdfMake()
  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(def).getBlob((b) => resolve(b))
    } catch (e) {
      reject(e)
    }
  })
}

let brandLogo: Promise<string | null> | null = null

/** Logo STEFF como imagen para PDF. */
export function getBrandLogo(): Promise<string | null> {
  if (!brandLogo) brandLogo = imageToDataUrl(logoUrl)
  return brandLogo
}

export const NAVY = '#032e4d'
export const GRAY_FILL = '#e5e7eb'
export const LIGHT_FILL = '#f1f5f9'

/** Tamaño carta (igual que los documentos originales). */
export const LETTER = 'LETTER' as const

export function fileSafe(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'documento'
  )
}
