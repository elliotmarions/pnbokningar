'use client'
import { createContext, useContext, useRef } from 'react'

interface AdminCacheCtx {
  get: (key: string) => unknown
  set: (key: string, data: unknown) => void
  del: (key: string) => void
}

const AdminCache = createContext<AdminCacheCtx>({
  get: () => undefined,
  set: () => {},
  del: () => {},
})

/**
 * Provides a session-scoped in-memory cache that survives Next.js App Router
 * tab navigations. The layout component stays mounted between sibling route
 * changes, so this context persists its data across all admin tab switches.
 *
 * Uses useRef so cache writes never trigger re-renders.
 */
export function AdminCacheProvider({ children }: { children: React.ReactNode }) {
  const store = useRef<Record<string, unknown>>({})
  return (
    <AdminCache.Provider value={{
      get: (key) => store.current[key],
      set: (key, data) => { store.current[key] = data },
      del: (key) => { delete store.current[key] },
    }}>
      {children}
    </AdminCache.Provider>
  )
}

export const useAdminCache = () => useContext(AdminCache)
