import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { ContractBlock, ContractData } from '../types'
import { fmtLongDate, fmtMoney, num } from '../format'
import { publicUrl, imageToDataUrl } from '../storage'
import { createPdfBlob, getBrandLogo, GRAY_FILL, LETTER } from './engine'

const DELIVERY_INDEX: Record<string, number> = { normal: 0, express1: 1, express2: 2 }

function shortDate(d: string): string {
  if (!d || d.length < 10) return d || ''
  return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(2, 4)}`
}

function dash(s: string | null | undefined): string {
  const v = (s ?? '').trim()
  return v === '' ? '-' : v
}

const thinLayout = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => '#333333',
  vLineColor: () => '#333333',
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
}

function datosBlock(d: ContractData): Content {
  const tpl = d.template
  const rows: [string, string][] = [
    [tpl.city_line || 'Lugar y fecha:', fmtLongDate(d.contract_date)],
    ['Tipo de evento:', dash(d.event_type)],
    ['Fecha de evento:', d.event_date ? fmtLongDate(d.event_date) : '-'],
    ['Nombre del cliente:', dash(d.client_name)],
    ['Nombres principales:', dash(d.main_names)],
    ['Dirección:', dash(d.address)],
    ['Contacto:', dash(d.contact)],
  ]
  return {
    margin: [0, 6, 0, 10],
    table: {
      widths: [130, '*'],
      body: rows.map(([a, b]) => [
        { text: a, bold: true, fontSize: 10 },
        { text: b, bold: true, fontSize: 10 },
      ]),
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 2,
      paddingBottom: () => 2,
      paddingLeft: () => 0,
      paddingRight: () => 4,
    },
  }
}

function paqueteBlock(d: ContractData, b: ContractBlock): Content {
  return {
    margin: [0, 2, 0, 10],
    table: {
      widths: [62, '*'],
      body: [
        [
          { text: `${b.title || 'Paquete'}:`, bold: true, fontSize: 10 },
          { text: dash(d.package), fontSize: 10 },
        ],
      ],
    },
    layout: {
      ...thinLayout,
      vLineWidth: (i: number) => (i === 0 || i === 2 ? 0.7 : 0),
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
  }
}

function horariosBlock(d: ContractData): Content {
  const s = d.schedule
  const head = (t: string): TableCell => ({ text: t, alignment: 'center', fontSize: 10 })
  const cell = (t: string): TableCell => ({ text: dash(t), alignment: 'center', fontSize: 10 })
  return {
    margin: [0, 2, 0, 12],
    table: {
      widths: [90, '*', '*', '*'],
      body: [
        [{ text: '', fillColor: GRAY_FILL }, head('Sesión'), head('Misa'), head('Evento')],
        [
          { text: 'Dirección / lugar', alignment: 'center', fillColor: GRAY_FILL, fontSize: 10 },
          cell(s.sesion.place),
          cell(s.misa.place),
          cell(s.evento.place),
        ],
        [
          { text: 'Hora', alignment: 'center', fillColor: GRAY_FILL, fontSize: 10 },
          cell(s.sesion.time),
          cell(s.misa.time),
          cell(s.evento.time),
        ],
      ],
    },
    layout: thinLayout,
  }
}

function pagosBlock(d: ContractData, b: ContractBlock): Content[] {
  const total = num(d.total)
  let balance = total
  const rows: TableCell[][] = [
    [
      { text: 'IMPORTE', bold: true, alignment: 'center', fontSize: 10 },
      { text: 'FECHA', bold: true, alignment: 'center', fontSize: 10 },
      { text: 'SALDO', bold: true, alignment: 'center', fontSize: 10 },
    ],
  ]
  for (const p of d.payments) {
    balance -= num(p.amount)
    rows.push([
      { text: `${(p.concept || 'Abono').toUpperCase()}   ${fmtMoney(p.amount, num(p.amount) % 1 === 0)}`, bold: true, fontSize: 10 },
      { text: shortDate(p.date), bold: true, alignment: 'center', fontSize: 10 },
      { text: fmtMoney(Math.max(balance, 0), Math.max(balance, 0) % 1 === 0), bold: true, alignment: 'center', fontSize: 10 },
    ])
  }
  if (balance > 0.009) {
    rows.push([
      { text: 'ABONO   $', bold: true, fontSize: 10 },
      { text: ' ', fontSize: 10 },
      { text: ' ', fontSize: 10 },
    ])
  }
  return [
    { text: b.title || 'PLAN DE PAGOS', bold: true, fontSize: 11, margin: [0, 4, 0, 6] },
    { table: { widths: ['*', '*', '*'], body: rows }, layout: thinLayout },
    { text: `Total a pagar: ${fmtMoney(total, total % 1 === 0)}`, bold: true, fontSize: 11, margin: [0, 6, 0, 12] },
  ]
}

function entregaBlock(d: ContractData, b: ContractBlock): Content[] {
  const opts = b.options && b.options.length ? b.options : []
  if (!opts.length) return []
  const sel = DELIVERY_INDEX[d.delivery_type] ?? -1
  const fill = (i: number) => (i === sel ? GRAY_FILL : undefined)
  const widths = opts.map(() => '*')
  return [
    { text: b.title || 'TIEMPO DE ENTREGA', bold: true, fontSize: 11, margin: [0, 2, 0, 6] },
    {
      table: {
        widths,
        body: [
          opts.map((o, i) => ({ text: o.name, bold: true, alignment: 'center', fontSize: 10, fillColor: fill(i) }) as TableCell),
          opts.map((o, i) => ({ text: o.time, bold: true, alignment: 'center', fontSize: 10, fillColor: fill(i) }) as TableCell),
          opts.map((o, i) => ({ text: o.price, bold: true, alignment: 'center', fontSize: 10, fillColor: fill(i) }) as TableCell),
        ],
      },
      layout: thinLayout,
      margin: [0, 0, 0, 12],
    },
  ]
}

function notasBlock(b: ContractBlock): Content[] {
  return (b.items ?? [])
    .filter((t) => t.trim())
    .map(
      (t) =>
        ({
          margin: [0, 0, 0, 8],
          table: {
            widths: ['*'],
            body: [[{ text: [{ text: 'NOTA: ', bold: true }, t], fontSize: 9, alignment: 'justify' }]],
          },
          layout: { ...thinLayout, hLineWidth: () => 1.6, vLineWidth: () => 1.6, hLineColor: () => '#111111', vLineColor: () => '#111111' },
        }) as Content,
    )
}

function firmasBlock(d: ContractData): Content {
  const line = (): Content => ({ canvas: [{ type: 'line' as const, x1: 16, y1: 0, x2: 216, y2: 0, lineWidth: 0.8 }] })
  const rep = d.template.representative || ' '
  return {
    margin: [0, 34, 0, 10],
    unbreakable: true,
    columns: [
      { width: '*', stack: [line(), { text: rep, fontSize: 10, margin: [0, 4, 0, 0] }], alignment: 'center' },
      { width: 40, text: '' },
      {
        width: '*',
        stack: [line(), { text: d.client_name ? `${d.client_name}` : 'Cliente', fontSize: 10, margin: [0, 4, 0, 0] }, { text: 'Cliente', fontSize: 8, color: '#555555' }],
        alignment: 'center',
      },
    ],
  }
}

function clausulasBlock(b: ContractBlock): Content[] {
  const items = (b.items ?? []).filter((t) => t.trim())
  if (!items.length) return []
  return [
    { text: b.title || 'CLÁUSULAS', alignment: 'center', bold: true, fontSize: 10, margin: [0, 0, 0, 10], pageBreak: b.new_page ? 'before' : undefined },
    ...items.map((t, i) => ({ text: `${i + 1}.- ${t}`, fontSize: 8.5, alignment: 'justify' as const, margin: [0, 0, 0, 6] as [number, number, number, number], lineHeight: 1.15 })),
  ]
}

function textoBlock(b: ContractBlock): Content[] {
  return [
    ...(b.title ? [{ text: b.title, bold: true, fontSize: 11, margin: [0, 4, 0, 4] as [number, number, number, number], pageBreak: b.new_page ? ('before' as const) : undefined }] : []),
    { text: b.body ?? '', fontSize: 9.5, alignment: 'justify' as const, margin: [0, 0, 0, 10] as [number, number, number, number], lineHeight: 1.15 },
  ]
}

function extraSections(d: ContractData): Content[] {
  return (d.extra_sections ?? [])
    .filter((s) => s.title.trim() || s.body.trim())
    .flatMap((s) => [
      { text: s.title, bold: true, fontSize: 11, margin: [0, 6, 0, 4] as [number, number, number, number] },
      { text: s.body, fontSize: 9.5, alignment: 'justify' as const, margin: [0, 0, 0, 8] as [number, number, number, number], lineHeight: 1.15 },
    ])
}

export async function buildContractPdf(d: ContractData, folio?: number | null): Promise<Blob> {
  const tpl = d.template
  let logo: string | null = null
  if (tpl.show_logo) {
    logo = d.logo_path ? await imageToDataUrl(publicUrl(d.logo_path)) : null
    if (!logo) logo = await getBrandLogo()
  }

  const blocks = tpl.blocks.filter((b) => b.enabled)
  const lastFirmas = blocks.map((b) => b.type).lastIndexOf('firmas')
  const content: Content[] = []

  if (logo) content.push({ image: logo, fit: [140, 62], alignment: 'center', margin: [0, 0, 0, 8] })
  content.push({ text: tpl.title || 'C O N T R A T O', alignment: 'center', bold: true, fontSize: 15, characterSpacing: 1.5, margin: [0, 0, 0, 12] })

  blocks.forEach((b, i) => {
    if (i === lastFirmas) content.push(...extraSections(d))
    switch (b.type) {
      case 'datos':
        content.push(datosBlock(d))
        break
      case 'paquete':
        content.push(paqueteBlock(d, b))
        break
      case 'horarios':
        content.push(horariosBlock(d))
        break
      case 'plan_pagos':
        content.push(...pagosBlock(d, b))
        break
      case 'tiempo_entrega':
        content.push(...entregaBlock(d, b))
        break
      case 'notas':
        content.push(...notasBlock(b))
        break
      case 'firmas':
        content.push(firmasBlock(d))
        break
      case 'clausulas':
        content.push(...clausulasBlock(b))
        break
      case 'texto':
        content.push(...textoBlock(b))
        break
      default:
        break
    }
  })
  if (lastFirmas === -1) content.push(...extraSections(d))

  const def: TDocumentDefinitions = {
    pageSize: LETTER,
    pageMargins: [54, 36, 54, 44],
    info: { title: `Contrato ${d.client_name}`.trim(), author: 'STEFF' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111111' },
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: folio ? `Folio ${String(folio).padStart(4, '0')}` : '', fontSize: 7, color: '#777777' },
        { text: `Página ${page} de ${pages}`, alignment: 'right', fontSize: 7, color: '#777777' },
      ],
      margin: [54, 16, 54, 0],
    }),
  }
  return createPdfBlob(def)
}
