import { useMemo, useState } from 'react'
import { CheckCircle2, ImagePlus, MessageCircle, Send, X } from 'lucide-react'
import { Field, Modal } from './ui'
import { supabase } from '../lib/supabase'
import { compressImage, publicUrl, uploadFile, validateImage } from '../lib/storage'
import { waLink, waPhone } from '../lib/whatsapp'
import type { Client } from '../lib/types'
import { useSettings } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Envío de mensajes de WhatsApp a varios clientes.
 * WhatsApp no permite enviar mensajes masivos automáticamente desde una página web
 * sin la API oficial de pago, por eso se prepara cada mensaje y se envía con un clic.
 */
export default function WhatsAppBroadcast({ open, onClose, clients }: { open: boolean; onClose: () => void; clients: Client[] }) {
  const settings = useSettings()
  const toast = useToast()
  const [message, setMessage] = useState('Hola {nombre}, ')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'redactar' | 'enviar'>('redactar')
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setSent(new Set())
      setStep('redactar')
    }
  }

  const valid = useMemo(() => clients.filter((c) => waPhone(c.phone, settings.whatsapp_country_code)), [clients, settings.whatsapp_country_code])
  const withoutPhone = clients.length - valid.length

  const textFor = (c: Client) => {
    const first = c.full_name.split(/\s+/)[0] ?? c.full_name
    let t = message.split('{nombre}').join(first)
    if (imagePath) t += `\n\n${publicUrl(imagePath)}`
    return t
  }

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    const err = validateImage(file)
    if (err) return toast.error(err)
    setUploading(true)
    try {
      setImagePath(await uploadFile('media', 'promociones', await compressImage(file), file.name))
    } catch (e) {
      toast.error(e)
    } finally {
      setUploading(false)
    }
  }

  const sendTo = async (c: Client) => {
    window.open(waLink(c.phone, textFor(c), settings.whatsapp_country_code), '_blank')
    setSent((s) => new Set(s).add(c.id))
    const { error } = await supabase.from('wa_messages').insert({ client_id: c.id, message: textFor(c), image_path: imagePath })
    if (error) toast.error('El mensaje se abrió en WhatsApp, pero no se pudo guardar en el historial.')
  }

  const next = valid.find((c) => !sent.has(c.id))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mensaje de WhatsApp a ${clients.length} cliente(s)`}
      size="md"
      footer={
        step === 'redactar' ? (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-whatsapp"
              disabled={!message.trim() || uploading || valid.length === 0}
              onClick={() => setStep('enviar')}
            >
              Continuar
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => setStep('redactar')}>
              Editar mensaje
            </button>
            {next ? (
              <button className="btn-whatsapp" onClick={() => void sendTo(next)}>
                <Send className="h-4 w-4" /> Enviar al siguiente ({next.full_name.split(' ')[0]})
              </button>
            ) : (
              <button className="btn-primary" onClick={onClose}>
                Terminar
              </button>
            )}
          </>
        )
      }
    >
      {step === 'redactar' ? (
        <div className="space-y-4">
          <Field label="Mensaje" hint="Escribe {nombre} para poner el nombre de cada cliente.">
            <textarea className="input min-h-[140px]" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div>
            <span className="label">Imagen de promoción (opcional)</span>
            {imagePath ? (
              <div className="relative inline-block">
                <img src={publicUrl(imagePath)} alt="Promoción" className="h-40 rounded-lg border border-slate-200 object-cover" />
                <button className="absolute right-1 top-1 rounded-full bg-white p-1 shadow" onClick={() => setImagePath(null)} aria-label="Quitar imagen">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="btn-secondary cursor-pointer">
                <ImagePlus className="h-4 w-4" /> {uploading ? 'Subiendo…' : 'Agregar imagen'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} />
              </label>
            )}
            <p className="mt-1 text-xs text-slate-400">La imagen se agrega como enlace al final del mensaje; WhatsApp muestra la vista previa.</p>
          </div>
          {withoutPhone > 0 && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">{withoutPhone} cliente(s) no tienen teléfono y se omitirán.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-lg bg-navy-50 p-3 text-sm text-navy-800">
            Se abrirá WhatsApp con el mensaje listo para cada cliente. Solo presiona <b>Enviar</b> en WhatsApp y regresa aquí para el siguiente.
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {valid.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.full_name}</p>
                  <p className="text-xs text-slate-400">{c.phone}</p>
                </div>
                {sent.has(c.id) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Abierto
                  </span>
                ) : (
                  <button className="btn-whatsapp btn-sm" onClick={() => void sendTo(c)}>
                    <MessageCircle className="h-4 w-4" /> Enviar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
