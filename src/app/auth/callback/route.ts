import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/email-domain'

/**
 * Handles the redirect back from Supabase after Azure (or any other) OAuth
 * provider has authenticated the user. Exchanges the `code` param for a
 * session cookie, then redirects the user to their landing page.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/driver'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Azure also lets personal Microsoft accounts and guests through.
      if (!isAllowedEmail(data.user?.email)) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=domain`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — bounce back to login with an error hint.
  return NextResponse.redirect(`${origin}/?error=auth`)
}
