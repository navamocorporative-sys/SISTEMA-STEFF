import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Checkbox, Field } from './ui'
import type { GuideContent, GuideRow, GuideSection } from '../lib/types'

/** Editor de la guía de trabajo (información de captura y planos por momento). */
export default function GuideEditor({ value, onChange, showCapture = true }: { value: GuideContent; onChange: (g: GuideContent) => void; showCapture?: boolean }) {
  const set = <K extends keyof GuideContent>(k: K, v: GuideContent[K]) => onChange({ ...value, [k]: v })

  const setSection = (i: number, s: GuideSection) => set('sections', value.sections.map((x, j) => (j === i ? s : x)))
  const moveSection = (i: number, d: -1 | 1) => {
    const arr = [...value.sections]
    const j = i + d
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    set('sections', arr)
  }
  const setRow = (si: number, ri: number, r: GuideRow) => {
    const s = value.sections[si]
    setSection(si, { ...s, rows: s.rows.map((x, j) => (j === ri ? r : x)) })
  }
  const moveRow = (si: number, ri: number, d: -1 | 1) => {
    const s = value.sections[si]
    const rows = [...s.rows]
    const j = ri + d
    if (j < 0 || j >= rows.length) return
    ;[rows[ri], rows[j]] = [rows[j], rows[ri]]
    setSection(si, { ...s, rows })
  }

  return (
    <div className="space-y-6">
      {showCapture && (
        <section>
          <h3 className="section-title mb-3">Información de captura y entrega de material</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ejecución del trabajo" hint="Ej. FOTOGRAFÍA, VIDEO, DRON">
              <input className="input" value={value.work_type} onChange={(e) => set('work_type', e.target.value)} />
            </Field>
            <Field label="Formato" hint="Ej. JPG, MP4, RAW">
              <input className="input" value={value.format} onChange={(e) => set('format', e.target.value)} />
            </Field>
            <Field label="Cantidad de fotografías">
              <input className="input" value={value.photo_qty} onChange={(e) => set('photo_qty', e.target.value)} />
            </Field>
            <Field label="Cantidad de videos">
              <input className="input" value={value.video_qty} onChange={(e) => set('video_qty', e.target.value)} />
            </Field>
            <Field label="Entrega de contenido" className="sm:col-span-2">
              <input className="input" value={value.delivery_text} onChange={(e) => set('delivery_text', e.target.value)} />
            </Field>
            <Field label="Plataforma de envío">
              <input className="input" value={value.delivery_platform} onChange={(e) => set('delivery_platform', e.target.value)} />
            </Field>
            <Field label="Enlace">
              <input className="input" value={value.delivery_link} onChange={(e) => set('delivery_link', e.target.value)} />
            </Field>
            <Field label="Indicaciones adicionales" className="sm:col-span-2">
              <textarea className="input min-h-[70px]" value={value.extra_notes ?? ''} onChange={(e) => set('extra_notes', e.target.value)} />
            </Field>
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title mb-3">Guía de trabajo</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nota de la guía">
            <input className="input" value={value.guide_note} onChange={(e) => set('guide_note', e.target.value)} />
          </Field>
          <Field label="Título de la segunda columna">
            <input className="input" value={value.column_label} onChange={(e) => set('column_label', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 space-y-4">
          {value.sections.map((s, si) => (
            <div key={si} className="rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <input className="input flex-1 font-semibold" value={s.title} onChange={(e) => setSection(si, { ...s, title: e.target.value })} placeholder="Lugar / momento" />
                <button type="button" className="btn-icon" onClick={() => moveSection(si, -1)} disabled={si === 0} title="Subir">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" className="btn-icon" onClick={() => moveSection(si, 1)} disabled={si === value.sections.length - 1} title="Bajar">
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn-icon hover:text-red-600"
                  onClick={() => set('sections', value.sections.filter((_, j) => j !== si))}
                  title="Eliminar sección"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {s.rows.map((r, ri) => (
                  <div key={ri} className="grid grid-cols-1 gap-2 p-3 md:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-2">
                      <input className="input" value={r.item} onChange={(e) => setRow(si, ri, { ...r, item: e.target.value })} placeholder="Toma / momento" />
                      <input className="input text-xs" value={r.note} onChange={(e) => setRow(si, ri, { ...r, note: e.target.value })} placeholder="Nota (opcional)" />
                    </div>
                    <textarea className="input min-h-[68px] text-xs" value={r.spec} onChange={(e) => setRow(si, ri, { ...r, spec: e.target.value })} placeholder="Plano / Ángulos / MC" />
                    <div className="flex items-start gap-1 md:flex-col">
                      <button type="button" className="btn-icon" onClick={() => moveRow(si, ri, -1)} disabled={ri === 0} title="Subir">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" className="btn-icon" onClick={() => moveRow(si, ri, 1)} disabled={ri === s.rows.length - 1} title="Bajar">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon hover:text-red-600"
                        onClick={() => setSection(si, { ...s, rows: s.rows.filter((_, j) => j !== ri) })}
                        title="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setSection(si, { ...s, rows: [...s.rows, { item: '', note: '', spec: '' }] })}>
                  <Plus className="h-4 w-4" /> Agregar toma
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => set('sections', [...value.sections, { title: 'Lugar / ', rows: [{ item: '', note: '', spec: '' }] }])}
          >
            <Plus className="h-4 w-4" /> Agregar sección
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <Checkbox checked={value.include_family} onChange={(v) => set('include_family', v)} label="Incluir fotos de familiares en el PDF" />
        <Field label="Nota final (confidencialidad)">
          <textarea className="input min-h-[80px]" value={value.final_note} onChange={(e) => set('final_note', e.target.value)} />
        </Field>
      </section>
    </div>
  )
}
