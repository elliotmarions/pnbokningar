'use client'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client. Use this in Client Components for sign-in /
 * sign-out and for any client-initiated auth flows.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
