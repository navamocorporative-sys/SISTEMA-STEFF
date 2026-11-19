import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, usernameToEmail, friendlyError } from '../lib/supabase'
import type { Profile, Settings } from '../lib/types'

interface AuthApi {
  session: Session | null
  profile: Profile | null
  settings: Settings | null
  isAdmin: boolean
  ready: boolean
  profileError: string | null
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  reloadSettings: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthCtx = createContext<AuthApi | null>(null)

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  business_name: 'STEFF',
  city: 'Hermosillo, Sonora',
  representative_name: '',
  phone: '',
  email: '',
  address: '',
  whatsapp_country_code: '52',
  updated_at: '',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [ready, setReady] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) {
      setProfileError(friendlyError(error))
      setProfile(null)
      return
    }
    setProfileError(data ? null : 'Tu usuario no tiene un perfil en el sistema. Pide al administrador que lo active.')
    setProfile((data as Profile | null) ?? null)
  }, [])

  const reloadSettings = useCallback(async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    setSettings((data as Settings | null) ?? DEFAULT_SETTINGS)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return
        setSession(data.session)
        if (data.session) {
          await loadProfile(data.session.user.id)
          await reloadSettings()
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return
      setSession(s)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setSettings(null)
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Se difiere para no bloquear el callback de Supabase.
        window.setTimeout(() => {
          void loadProfile(s?.user.id)
          void reloadSettings()
        }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile, reloadSettings])

  const signIn = useCallback(
    async (username: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      })
      if (error) throw error
      setSession(data.session)
      await loadProfile(data.user?.id)
      await reloadSettings()
    },
    [loadProfile, reloadSettings],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const reloadProfile = useCallback(async () => {
    await loadProfile(session?.user.id)
  }, [loadProfile, session])

  const value = useMemo<AuthApi>(
    () => ({
      session,
      profile,
      settings,
      isAdmin: profile?.role === 'admin' && profile.active,
      ready,
      profileError,
      signIn,
      signOut,
      reloadSettings,
      reloadProfile,
    }),
    [session, profile, settings, ready, profileError, signIn, signOut, reloadSettings, reloadProfile],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

export function useSettings(): Settings {
  const { settings } = useAuth()
  return settings ?? DEFAULT_SETTINGS
}
