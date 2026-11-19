import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import logo from '../assets/logo-steff.png'
import { useAuth } from '../context/AuthContext'
import { friendlyError, isConfigured } from '../lib/supabase'
import { Spinner } from '../components/ui'

export default function Login() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Escribe tu usuario y contraseña.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await signIn(username, password)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 overflow-hidden bg-gradient-to-br from-navy-900 via-navy-900 to-navy-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full bg-white/5" />
        <p className="relative font-display text-sm font-bold uppercase tracking-[0.3em] text-navy-200">Sistema para eventos</p>
        <div className="relative">
          <h1 className="font-display text-4xl font-extrabold leading-tight text-white">
            Todo tu negocio de eventos,
            <br />
            en un solo lugar.
          </h1>
          <p className="mt-4 max-w-md text-navy-100">
            Eventos, contratos, equipo de trabajo, entregas, finanzas, proveedores, clientes y publicidad.
          </p>
        </div>
        <p className="relative text-xs text-navy-300">© {new Date().getFullYear()} STEFF</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <img src={logo} alt="STEFF" className="mx-auto mb-8 h-24 w-auto" />
          <h2 className="text-center text-2xl font-extrabold">Iniciar sesión</h2>
          <p className="mb-8 mt-1 text-center text-sm text-slate-500">Ingresa con tu usuario y contraseña</p>

          {!isConfigured && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Falta configurar la conexión con Supabase (archivo <b>.env</b> o variables del hosting). Revisa el README.
            </div>
          )}

          <label className="label" htmlFor="username">
            Usuario
          </label>
          <div className="relative mb-4">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="username"
              className="input py-2.5 pl-9"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
            />
          </div>

          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <div className="relative mb-2">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              className="input py-2.5 pl-9 pr-10"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-navy-900"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}

          <button type="submit" className="btn-primary mt-6 w-full py-2.5" disabled={loading}>
            {loading ? <Spinner className="h-4 w-4 text-white" /> : null}
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
