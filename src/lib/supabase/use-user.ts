'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from './client'

export interface AppUser {
  id: string
  name?: string | null
  email?: string | null
}

const CACHE_KEY = 'pn-app-user'

function readCached(): AppUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as AppUser) : null
  } catch { return null }
}
function writeCached(u: AppUser | null) {
  if (typeof window === 'undefined') return
  try {
    if (u) sessionStorage.setItem(CACHE_KEY, JSON.stringify(u))
    else sessionStorage.removeItem(CACHE_KEY)
  } catch {}
}

/**
 * Client-side hook returning the currently logged-in user.
 *
 * Returns the cached user immediately on mount (no flicker on tab navigation)
 * and revalidates in the background via Supabase. Subscribes to auth state
 * changes so signing in/out in another tab updates the UI.
 */
export function useUser() {
  // Read cache synchronously on first render — no `undefined` flash between
  // pages within the same session.
  const [user, setUser] = useState<AppUser | null | undefined>(() => readCached() ?? undefined)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const apply = (raw: { id: string; email?: string | null; user_metadata?: unknown } | null) => {
      if (!mounted) return
      if (raw) {
        const meta = raw.user_metadata as Record<string, unknown> | undefined
        const next: AppUser = {
          id: raw.id,
          name: (meta?.full_name as string) ?? (meta?.name as string) ?? raw.email ?? null,
          email: raw.email ?? null,
        }
        setUser(next)
        writeCached(next)
      } else {
        setUser(null)
        writeCached(null)
      }
    }

    supabase.auth.getUser().then(({ data }) => apply(data.user))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null)
    })

    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  return user
}

/**
 * Sign-out helper: clears the Supabase session and redirects to login.
 */
export function useSignOut() {
  const router = useRouter()
  return async () => {
    const supabase = createClient()
    writeCached(null)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }
}
