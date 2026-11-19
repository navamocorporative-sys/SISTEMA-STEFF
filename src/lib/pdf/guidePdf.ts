import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { EventRow, FamilyMember, GuideContent } from '../types'
import { fmtLongDate, fmtTimeRange } from '../format'
import { imageToDataUrl, publicUrl } from '../storage'
import { createPdfBlob, getBrandLogo, GRAY_FILL, LETTER } from './engine'

export interface GuidePdfInput {
  guide: GuideContent
  event: EventRow
  clientName: string
  staffName: string
  family: FamilyMember[]
}

const grid = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => '#222222',
  vLineColor: () => '#222222',
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
}

function labelValue(label: string, value: string): Content {
  return { text: [{ text: `${label}: `, bold: true }, { text: value || '-' }], fontSize: 10, margin: [0, 0, 0, 3] }
}

function personLabel(workType: string): string {
  const w = workType.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (w.includes('FOTO')) return 'NOMBRE DEL FOTÓGRAFO'
  if (w.includes('VIDEO')) return 'NOMBRE DEL VIDEÓGRAFO'
  return 'NOMBRE DEL COLABORADOR'
}

function placeCell(place: string, url: string): TableCell {
  if (!place && !url) return { text: '-', alignment: 'center', fontSize: 9 }
  const stack: Content[] = []
  if (place) stack.push({ text: place, alignment: 'center', fontSize: 9 })
  if (url) {
    stack.push({ text: 'UBICACIÓN:', alignment: 'center', fontSize: 8, bold: true, margin: [0, 4, 0, 0] })
    stack.push({ text: url, link: url, alignment: 'center', fontSize: 7.5, color: '#1d4ed8' })
  }
  return { stack }
}

export async function buildGuidePdf(input: GuidePdfInput): Promise<Blob> {
  const { guide: g, event: e, clientName, staffName, family } = input
  const logo = await getBrandLogo()
  const content: Content[] = []

  if (logo) content.push({ image: logo, fit: [120, 70], alignment: 'center', margin: [0, 0, 0, 14] })

  content.push(
    labelValue('EJECUCIÓN DEL TRABAJO', g.work_type.toUpperCase()),
    labelValue(personLabel(g.work_type), staffName.toUpperCase()),
    labelValue('PROYECTO NÚMERO', e.project_number),
    { text: '', margin: [0, 0, 0, 6] },
    labelValue('FECHA DE EVENTO', fmtLongDate(e.event_date).toUpperCase()),
    labelValue('TIPO DE EVENTO', e.event_type.toUpperCase()),
    labelValue('NOMBRE DEL CLIENTE', (e.main_names || clientName).toUpperCase()),
  )

  const head = (t: string): TableCell => ({ text: t, bold: true, alignment: 'center', fontSize: 9 })
  content.push(
    { text: 'INFORMACIÓN DEL EVENTO:', bold: true, fontSize: 10, margin: [0, 12, 0, 4] },
    {
      table: {
        widths: [80, '*', '*', '*'],
        body: [
          [head('INFORMACIÓN'), head('SESIÓN'), head('MISA'), head('EVENTO')],
          [
            head('HORARIO'),
            { text: fmtTimeRange(e.sesion_start, e.sesion_end) || '-', alignment: 'center', fontSize: 9 },
            { text: fmtTimeRange(e.misa_start, e.misa_end) || '-', alignment: 'center', fontSize: 9 },
            { text: fmtTimeRange(e.evento_start, e.evento_end) || '-', alignment: 'center', fontSize: 9 },
          ],
          [
            { text: 'LUGAR', bold: true, alignment: 'center', fontSize: 9, margin: [0, 10, 0, 0] },
            placeCell(e.sesion_place, e.sesion_maps_url),
            placeCell(e.misa_place, e.misa_maps_url),
            placeCell(e.evento_place, e.evento_maps_url),
          ],
        ],
      },
      layout: grid,
    },
  )

  content.push(
    { text: 'INFORMACIÓN DE CAPTURA Y ENTREGA DE MATERIAL', bold: true, fontSize: 10, margin: [0, 14, 0, 4] },
    labelValue('FORMATO', g.format),
    labelValue('CANTIDAD DE FOTOGRAFÍAS', g.photo_qty),
    labelValue('CANTIDAD DE VIDEOS', g.video_qty),
    labelValue('ENTREGA DE CONTENIDO', g.delivery_text),
  )
  if (g.delivery_platform || g.delivery_link) {
    content.push({
      text: [
        { text: `${(g.delivery_platform || 'PLATAFORMA').toUpperCase()}  LINK: `, bold: true },
        g.delivery_link ? { text: g.delivery_link, link: g.delivery_link, color: '#1d4ed8', decoration: 'underline' } : { text: '-' },
      ],
      fontSize: 10,
      margin: [0, 0, 0, 3],
    })
  }

  if (g.extra_notes && g.extra_notes.trim()) {
    content.push(
      { text: 'INDICACIONES ADICIONALES', bold: true, fontSize: 10, margin: [0, 10, 0, 4] },
      { text: g.extra_notes, fontSize: 9.5, alignment: 'justify' },
    )
  }

  content.push(
    { text: 'GUÍA DE TRABAJO', bold: true, fontSize: 11, margin: [0, 14, 0, 2] },
    g.guide_note ? { text: [{ text: 'NOTA: ', bold: true }, g.guide_note.toUpperCase()], fontSize: 9, margin: [0, 0, 0, 8] } : { text: '' },
  )

  for (const section of g.sections) {
    const rows = section.rows.filter((r) => r.item.trim() || r.spec.trim())
    if (!rows.length) continue
    content.push({
      margin: [0, 0, 0, 10],
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 170],
        body: [
          [
            { text: section.title, bold: true, fontSize: 9.5, fillColor: GRAY_FILL },
            { text: g.column_label || 'Planos, ángulos y movimientos de cámara', bold: true, fontSize: 9.5, fillColor: GRAY_FILL },
          ],
          ...rows.map((r) => [
            {
              stack: [
                { text: `•  ${r.item}`, fontSize: 9.5 },
                ...(r.note ? [{ text: r.note, fontSize: 8.5, italics: true, color: '#444444', margin: [10, 3, 0, 0] as [number, number, number, number] }] : []),
              ],
            } as TableCell,
            { text: r.spec, fontSize: 9 } as TableCell,
          ]),
        ],
      },
      layout: grid,
    })
  }

  if (g.include_family && family.length) {
    const images = await Promise.all(family.map((f) => (f.photo_path ? imageToDataUrl(publicUrl(f.photo_path)) : Promise.resolve(null))))
    const cells: TableCell[] = family.map((f, i) => {
      const img = images[i]
      return {
        stack: [
          img ? { image: img, fit: [140, 120], alignment: 'center' as const } : { text: 'Sin foto', alignment: 'center' as const, color: '#888888', fontSize: 8, margin: [0, 40, 0, 40] as [number, number, number, number] },
          { text: f.name, bold: true, alignment: 'center' as const, fontSize: 9, margin: [0, 4, 0, 0] as [number, number, number, number] },
          ...(f.relationship ? [{ text: f.relationship, alignment: 'center' as const, fontSize: 8, color: '#444444' }] : []),
          ...(f.notes ? [{ text: f.notes, alignment: 'center' as const, fontSize: 7.5, color: '#666666' }] : []),
        ],
      }
    })
    const body: TableCell[][] = []
    for (let i = 0; i < cells.length; i += 3) {
      const row = cells.slice(i, i + 3)
      while (row.length < 3) row.push({ text: '' })
      body.push(row)
    }
    content.push(
      { text: 'FAMILIARES Y PERSONAS IMPORTANTES', bold: true, fontSize: 11, margin: [0, 8, 0, 6], pageBreak: 'before' },
      { table: { widths: ['*', '*', '*'], body, dontBreakRows: true }, layout: grid },
    )
  }

  if (g.final_note) {
    content.push({
      margin: [0, 16, 0, 0],
      table: { widths: ['*'], body: [[{ text: g.final_note, bold: true, fontSize: 8.5, fillColor: '#cffafe' }]] },
      layout: 'noBorders',
    })
  }

  const def: TDocumentDefinitions = {
    pageSize: LETTER,
    pageMargins: [54, 46, 54, 46],
    info: { title: `Guía ${e.project_number} ${staffName}`, author: 'STEFF' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111111' },
    content,
    footer: (page: number, pages: number) => ({
      text: `Proyecto ${e.project_number}  ·  Página ${page} de ${pages}`,
      alignment: 'right',
      fontSize: 7,
      color: '#777777',
      margin: [54, 16, 54, 0],
    }),
  }
  return createPdfBlob(def)
}
