'use client'

/**
 * No global auth provider needed — @supabase/ssr stores the session in
 * cookies, refreshed by middleware. Components that need the current user on
 * the client can call `createClient()` from `@/lib/supabase/client` and use
 * `supabase.auth.getUser()` or `supabase.auth.onAuthStateChange()`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
