import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createPdfBlob, getBrandLogo, LETTER, LIGHT_FILL, NAVY } from './engine'

export interface ReportKpi {
  label: string
  value: string
}

export interface ReportTable {
  title: string
  headers: string[]
  rows: string[][]
  /** Columnas alineadas a la derecha (montos) */
  alignRight?: number[]
  totals?: string[]
  widths?: (string | number)[]
}

export interface ReportInput {
  title: string
  subtitle?: string
  businessName: string
  kpis: ReportKpi[]
  tables: ReportTable[]
  landscape?: boolean
}

export async function buildReportPdf(r: ReportInput): Promise<Blob> {
  const logo = await getBrandLogo()
  const content: Content[] = []

  content.push({
    columns: [
      logo ? { image: logo, fit: [90, 50], width: 100 } : { text: r.businessName, bold: true, width: 100 },
      {
        width: '*',
        stack: [
          { text: r.title, bold: true, fontSize: 16, color: NAVY },
          ...(r.subtitle ? [{ text: r.subtitle, fontSize: 10, color: '#475569', margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
          { text: `Generado el ${format(new Date(), "d 'de' MMMM yyyy, h:mm a", { locale: es })}`, fontSize: 8, color: '#64748b', margin: [0, 4, 0, 0] },
        ],
        alignment: 'right',
      },
    ],
    margin: [0, 0, 0, 14],
  })

  if (r.kpis.length) {
    const perRow = r.landscape ? 5 : 4
    const body: TableCell[][] = []
    for (let i = 0; i < r.kpis.length; i += perRow) {
      const chunk = r.kpis.slice(i, i + perRow)
      const row: TableCell[] = chunk.map((k) => ({
        stack: [
          { text: k.label.toUpperCase(), fontSize: 7, color: '#64748b', bold: true },
          { text: k.value, fontSize: 12, bold: true, color: NAVY, margin: [0, 2, 0, 0] },
        ],
        fillColor: LIGHT_FILL,
      }))
      while (row.length < perRow) row.push({ text: '' })
      body.push(row)
    }
    content.push({
      table: { widths: Array(perRow).fill('*'), body },
      layout: {
        hLineWidth: () => 3,
        vLineWidth: () => 3,
        hLineColor: () => '#ffffff',
        vLineColor: () => '#ffffff',
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
      margin: [0, 0, 0, 14],
    })
  }

  for (const t of r.tables) {
    const right = new Set(t.alignRight ?? [])
    content.push({ text: t.title, bold: true, fontSize: 11, color: NAVY, margin: [0, 6, 0, 6] })
    if (!t.rows.length) {
      content.push({ text: 'Sin registros en este periodo.', fontSize: 9, color: '#64748b', margin: [0, 0, 0, 10] })
      continue
    }
    const body: TableCell[][] = [
      t.headers.map((h, i) => ({ text: h, bold: true, fontSize: 8, color: '#ffffff', fillColor: NAVY, alignment: right.has(i) ? 'right' : 'left' })),
      ...t.rows.map((row, ri) =>
        row.map((c, i) => ({ text: c, fontSize: 8, alignment: right.has(i) ? 'right' : 'left', fillColor: ri % 2 ? '#f8fafc' : undefined }) as TableCell),
      ),
    ]
    if (t.totals) {
      body.push(t.totals.map((c, i) => ({ text: c, bold: true, fontSize: 8.5, alignment: right.has(i) ? 'right' : 'left', fillColor: '#e2e8f0' })))
    }
    content.push({
      table: { headerRows: 1, widths: t.widths ?? t.headers.map(() => '*'), body },
      layout: {
        hLineWidth: () => 0.4,
        vLineWidth: () => 0,
        hLineColor: () => '#cbd5e1',
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 5,
        paddingRight: () => 5,
      },
      margin: [0, 0, 0, 12],
    })
  }

  const def: TDocumentDefinitions = {
    pageSize: LETTER,
    pageOrientation: r.landscape ? 'landscape' : 'portrait',
    pageMargins: [36, 36, 36, 40],
    info: { title: r.title, author: r.businessName },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0f172a' },
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: r.businessName, fontSize: 7, color: '#94a3b8' },
        { text: `Página ${page} de ${pages}`, alignment: 'right', fontSize: 7, color: '#94a3b8' },
      ],
      margin: [36, 14, 36, 0],
    }),
  }
  return createPdfBlob(def)
}
