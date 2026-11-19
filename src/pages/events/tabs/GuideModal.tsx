import { useEffect, useState } from 'react'
import { Download, MessageCircle, Save, Share2 } from 'lucide-react'
import { LoadingBlock, Modal } from '../../../components/ui'
import GuideEditor from '../../../components/GuideEditor'
import { supabase, must } from '../../../lib/supabase'
import { cloneGuide, getDefaultGuide } from '../../../lib/data'
import { buildGuidePdf } from '../../../lib/pdf/guidePdf'
import { fileSafe } from '../../../lib/pdf/engine'
import { downloadBlob, signedUrl, uploadFile } from '../../../lib/storage'
import { fmtLongDate } from '../../../lib/format'
import { sendViaWhatsApp, shareFile } from '../../../lib/whatsapp'
import type { AssignmentWithStaff, EventWithClient, FamilyMember, GuideContent } from '../../../lib/types'
import { useAuth, useSettings } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'

function workTypeFromRole(role: string): string {
  const r = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (r.includes('foto')) return r.includes('editor') ? 'EDICIÓN DE FOTOGRAFÍA' : 'FOTOGRAFÍA'
  if (r.includes('video')) return r.includes('editor') ? 'EDICIÓN DE VIDEO' : 'VIDEO'
  if (r.includes('dron')) return 'DRON'
  return role.toUpperCase()
}

export default function GuideModal({
  open,
  onClose,
  assignment,
  event,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  assignment: AssignmentWithStaff
  event: EventWithClient
  onSaved: () => void
}) {
  const { isAdmin } = useAuth()
  const settings = useSettings()
  const toast = useToast()
  const [guide, setGuide] = useState<GuideContent | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const g = assignment.guide ? cloneGuide(assignment.guide) : await getDefaultGuide()
        if (!assignment.guide) g.work_type = workTypeFromRole(assignment.role)
        if (alive) setGuide(g)
      } catch (e) {
        toast.error(e)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [assignment, toast])

  const staffName = assignment.staff?.full_name ?? ''

  const save = async (silent = false): Promise<boolean> => {
    if (!guide || !isAdmin) return true
    try {
      await must(supabase.from('assignments').update({ guide }).eq('id', assignment.id).select('id').single())
      if (!silent) toast.success('Guía guardada')
      onSaved()
      return true
    } catch (e) {
      toast.error(e)
      return false
    }
  }

  const makePdf = async (): Promise<Blob> => {
    if (!guide) throw new Error('La guía aún no está lista.')
    let family: FamilyMember[] = []
    if (guide.include_family) {
      family = await must<FamilyMember[]>(supabase.from('family_members').select('*').eq('event_id', event.id).order('created_at'))
    }
    return buildGuidePdf({ guide, event, clientName: event.clients?.full_name ?? '', staffName, family })
  }

  const fileName = `Guia_${event.project_number}_${fileSafe(staffName)}.pdf`

  const download = async () => {
    setBusy('pdf')
    try {
      await save(true)
      downloadBlob(await makePdf(), fileName)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const markSent = async () => {
    if (!isAdmin) return
    await supabase.from('assignments').update({ guide_sent_at: new Date().toISOString() }).eq('id', assignment.id)
    onSaved()
  }

  const message = (link?: string) =>
    `Hola ${staffName}, te comparto la información del evento y la guía de trabajo.\n\n` +
    `Proyecto: ${event.project_number}\nEvento: ${event.event_type}${event.main_names ? ` · ${event.main_names}` : ''}\n` +
    `Fecha: ${fmtLongDate(event.event_date)}\nFunción: ${assignment.role}` +
    (link ? `\n\nGuía en PDF: ${link}` : '')

  const sendWhatsApp = async () => {
    setBusy('wa')
    try {
      await sendViaWhatsApp(
        assignment.staff?.phone ?? '',
        async () => {
          await save(true)
          const blob = await makePdf()
          const path = await uploadFile('documentos', `guias/${event.project_number}`, blob, fileName)
          return message(await signedUrl(path))
        },
        settings.whatsapp_country_code,
      )
      await markSent()
      toast.success('Guía lista para enviar por WhatsApp')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const share = async () => {
    setBusy('share')
    try {
      await save(true)
      const blob = await makePdf()
      const ok = await shareFile(blob, fileName, message())
      if (ok) await markSent()
      else {
        downloadBlob(blob, fileName)
        toast.info('Tu dispositivo no permite compartir archivos; se descargó el PDF.')
      }
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Guía de trabajo · ${staffName} (${assignment.role})`}
      size="lg"
      footer={
        <>
          {isAdmin && (
            <button className="btn-secondary" onClick={() => void save()} disabled={!guide || !!busy}>
              <Save className="h-4 w-4" /> Guardar
            </button>
          )}
          <button className="btn-secondary" onClick={() => void download()} disabled={!guide || !!busy}>
            <Download className="h-4 w-4" /> {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
          </button>
          {canShare && (
            <button className="btn-secondary" onClick={() => void share()} disabled={!guide || !!busy}>
              <Share2 className="h-4 w-4" /> {busy === 'share' ? 'Preparando…' : 'Compartir PDF'}
            </button>
          )}
          {isAdmin && (
            <button className="btn-whatsapp" onClick={() => void sendWhatsApp()} disabled={!guide || !!busy}>
              <MessageCircle className="h-4 w-4" /> {busy === 'wa' ? 'Preparando…' : 'Enviar por WhatsApp'}
            </button>
          )}
        </>
      }
    >
      {!guide ? (
        <LoadingBlock />
      ) : (
        <>
          <p className="mb-5 rounded-lg bg-navy-50 p-3 text-sm text-navy-800">
            Los datos del evento (proyecto, fecha, tipo, cliente, horarios y lugares) se llenan solos desde el registro del evento. Aquí ajustas la información
            de captura y la guía para esta persona.
          </p>
          <GuideEditor value={guide} onChange={setGuide} />
        </>
      )}
    </Modal>
  )
}
