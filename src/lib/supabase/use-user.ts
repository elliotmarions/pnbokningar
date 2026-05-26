'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from './client'

export interface AppUser {
  id: string
  name?: string | null
  email?: string | null
}

/**
 * Client-side hook returning the currently logged-in user, or null while
 * loading / signed out. Subscribes to Supabase auth state so the UI updates
 * if the user signs in/out in another tab.
 */
export function useUser() {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      if (data.user) {
        const meta = data.user.user_metadata as Record<string, unknown> | undefined
        setUser({
          id: data.user.id,
          name: (meta?.full_name as string) ?? (meta?.name as string) ?? data.user.email ?? null,
          email: data.user.email ?? null,
        })
      } else {
        setUser(null)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      if (session?.user) {
        const meta = session.user.user_metadata as Record<string, unknown> | undefined
        setUser({
          id: session.user.id,
          name: (meta?.full_name as string) ?? (meta?.name as string) ?? session.user.email ?? null,
          email: session.user.email ?? null,
        })
      } else {
        setUser(null)
      }
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
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }
}
