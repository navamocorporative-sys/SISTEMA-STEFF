import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from '../lib/supabase'

export interface QueryState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: (updater: T | ((prev: T | undefined) => T)) => void
}

/** Carga datos de forma segura (evita actualizaciones después de desmontar). */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const callId = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async () => {
    const id = ++callId.current
    setLoading(true)
    setError(null)
    try {
      const result = await fnRef.current()
      if (mounted.current && id === callId.current) setDataState(result)
    } catch (e) {
      if (mounted.current && id === callId.current) setError(friendlyError(e))
    } finally {
      if (mounted.current && id === callId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void run()
    return () => {
      mounted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater))
  }, [])

  return { data, loading, error, reload: run, setData }
}
