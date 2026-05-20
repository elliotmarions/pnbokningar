import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter.
// Runs in the Next.js Edge Runtime — the store persists for the lifetime of
// the V8 isolate (minutes to hours on Vercel Edge), giving meaningful
// per-IP protection without an external KV store.
// ---------------------------------------------------------------------------

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>()
let lastCleanup = Date.now()

function rateLimit(
  ip: string,
  bucket: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()

  // Purge stale entries every 5 minutes to bound memory usage.
  if (now - lastCleanup > 300_000) {
    lastCleanup = now
    for (const [k, e] of store) {
      if (now > e.resetAt + 3_600_000) store.delete(k)
    }
  }

  const key = `${ip}|${bucket}`
  let entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    store.set(key, entry)
  }
  entry.count++
  return {
    ok: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  }
}

// ---------------------------------------------------------------------------
// Security headers added to every API response.
// ---------------------------------------------------------------------------
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag': 'noindex, nofollow',
}

function addSecurityHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
}

// ---------------------------------------------------------------------------
// Per-route rate limit config.
// ---------------------------------------------------------------------------
function getBucket(pathname: string): { bucket: string; limit: number; windowMs: number } {
  if (pathname.startsWith('/api/auth')) {
    // Strict: brute-force protection for login attempts.
    return { bucket: 'auth', limit: 10, windowMs: 60_000 }
  }
  if (pathname.startsWith('/api/setup')) {
    // Very strict: one-time setup endpoint should never be hammered.
    return { bucket: 'setup', limit: 5, windowMs: 3_600_000 }
  }
  if (pathname.startsWith('/api/users/password')) {
    // Password changes are sensitive.
    return { bucket: 'pw', limit: 5, windowMs: 60_000 }
  }
  // All other authenticated API routes — generous but bounded.
  return { bucket: 'api', limit: 120, windowMs: 60_000 }
}

// ---------------------------------------------------------------------------
// Middleware entry point.
// ---------------------------------------------------------------------------
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Cron routes are authenticated by CRON_SECRET header — skip rate limiting
  // here but still add security headers.
  if (pathname.startsWith('/api/cron')) {
    const res = NextResponse.next()
    addSecurityHeaders(res)
    return res
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const { bucket, limit, windowMs } = getBucket(pathname)
  const { ok, remaining, resetAt } = rateLimit(ip, bucket, limit, windowMs)

  if (!ok) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'För många förfrågningar. Försök igen om en stund.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          ...SECURITY_HEADERS,
        },
      },
    )
  }

  const res = NextResponse.next()
  addSecurityHeaders(res)
  res.headers.set('X-RateLimit-Limit', String(limit))
  res.headers.set('X-RateLimit-Remaining', String(remaining))
  return res
}

export const config = {
  matcher: ['/api/:path*'],
}
