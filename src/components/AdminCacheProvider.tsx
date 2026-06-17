'use client'
import { createContext, useContext, useRef } from 'react'

interface AdminCacheCtx {
  // maxAgeMs (optional): if given, entries older than this are treated as a
  // miss (returns undefined) so the caller paints a loading state instead of
  // stale data. Omit it to read regardless of age (legacy behaviour).
  get: (key: string, maxAgeMs?: number) => unknown
  set: (key: string, data: unknown) => void
  del: (key: string) => void
}

const AdminCache = createContext<AdminCacheCtx>({
  get: () => undefined,
  set: () => {},
  del: () => {},
})

const STORAGE_KEY = 'pn-admin-cache-v2'
const MAX_ENTRIES = 40

interface Entry { data: unknown; ts: number }
type Store = Record<string, Entry>

function loadInitial(): Store {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch { return {} }
}

/**
 * Session-scoped + localStorage-persisted in-memory cache.
 * Survives Next.js route changes (provider mounted in layout) AND page reloads.
 * SWR pattern handles staleness — entries are revalidated on read.
 */
export function AdminCacheProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<Store | null>(null)
  if (storeRef.current === null) storeRef.current = loadInitial()
  const store = storeRef as { current: Store }

  // Debounced persist to avoid hammering localStorage during bursts
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedulePersist = () => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      try {
        // Evict oldest entries if over cap
        const entries = Object.entries(store.current)
        if (entries.length > MAX_ENTRIES) {
          entries.sort((a, b) => b[1].ts - a[1].ts)
          store.current = Object.fromEntries(entries.slice(0, MAX_ENTRIES))
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.current))
      } catch {}
    }, 200)
  }

  return (
    <AdminCache.Provider value={{
      get: (key, maxAgeMs) => {
        const entry = store.current[key]
        if (!entry) return undefined
        if (typeof maxAgeMs === 'number' && Date.now() - entry.ts > maxAgeMs) return undefined
        return entry.data
      },
      set: (key, data) => {
        store.current[key] = { data, ts: Date.now() }
        schedulePersist()
      },
      del: (key) => {
        delete store.current[key]
        schedulePersist()
      },
    }}>
      {children}
    </AdminCache.Provider>
  )
}

export const useAdminCache = () => useContext(AdminCache)
