/**
 * Supabase-backed auth helpers.
 *
 * Keeps the same public surface (`getSession`, `requireUser`, `requireAdmin`)
 * as the old NextAuth implementation so existing API routes don't need to
 * change beyond their import.
 */

import { createClient } from './supabase/server'
import { userRepo } from './db'
import { displayName } from './names'

export interface AppSession {
  user: {
    id: string
    name?: string | null
    email?: string | null
    role?: 'driver' | 'admin'
    phone?: string | null
  }
}

/**
 * Returns the current session (Supabase user merged with our `users` row),
 * or null if no one is logged in.
 *
 * Ensures a row exists in our `users` table for first-time Azure logins.
 */
export async function getSession(): Promise<AppSession | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Azure provides name in user_metadata.full_name (or .name depending on claims).
  // Strip the ", Company" suffix Azure appends (e.g. "Elliot Marions, PostNord").
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const rawName =
    (meta?.full_name as string | undefined) ??
    (meta?.name as string | undefined) ??
    user.email ??
    'Okänd användare'
  const cleanName = displayName(rawName) || rawName

  // Ensure the application's users table has a row for this user.
  // First login through Azure → create it; later logins → just read the role.
  let dbUser
  try {
    dbUser = await userRepo.getById(user.id)
    if (!dbUser) {
      await userRepo.upsert({ id: user.id, name: cleanName, email: user.email ?? null })
      dbUser = await userRepo.getById(user.id)
    }
  } catch {
    // DB not yet available (build-time) — fall back to bare auth user.
  }

  return {
    user: {
      id: user.id,
      name: displayName(dbUser?.name) || cleanName,
      email: user.email ?? null,
      role: (dbUser?.role as 'driver' | 'admin' | undefined) ?? 'driver',
      phone: dbUser?.phone ?? null,
    },
  }
}

export async function requireUser(): Promise<AppSession | null> {
  return getSession()
}

export async function requireAdmin(): Promise<AppSession | null> {
  const session = await getSession()
  if (!session?.user) return null
  if (session.user.role !== 'admin') return null
  return session
}
