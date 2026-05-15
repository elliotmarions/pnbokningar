import { NextAuthOptions, getServerSession } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import CredentialsProvider from 'next-auth/providers/credentials'
import { userRepo } from './db'

const providers: NextAuthOptions['providers'] = []

// Azure AD provider (production)
if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_TENANT_ID) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID,
    })
  )
}

// Dev credentials provider — only enabled when NEXTAUTH_DEV_LOGIN=true
// Lets you log in as any seeded user by typing their ID
if (process.env.NEXTAUTH_DEV_LOGIN === 'true') {
  providers.push(
    CredentialsProvider({
      name: 'Dev Login',
      credentials: { userId: { label: 'User ID', type: 'text' } },
      async authorize(credentials) {
        if (!credentials?.userId) return null
        try {
          const user = userRepo.getById(credentials.userId)
          if (!user) return null
          return { id: user.id, name: user.name, email: user.email ?? undefined }
        } catch {
          return null
        }
      },
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Azure AD: profile.oid is the stable Object ID
      if (account?.provider === 'azure-ad' && profile) {
        const oid = (profile as Record<string, unknown>).oid as string | undefined
        if (oid) token.oid = oid
      }
      // Dev credentials: user.id is the seeded user ID
      if (account?.provider === 'credentials' && user?.id) {
        token.oid = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token.oid && session.user) {
        ;(session.user as Record<string, unknown>).id = token.oid
        try {
          const dbUser = userRepo.getById(token.oid as string)
          if (dbUser) {
            ;(session.user as Record<string, unknown>).role = dbUser.role
            ;(session.user as Record<string, unknown>).phone = dbUser.phone
          }
        } catch {
          // DB not yet available during build
        }
      }
      return session
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'azure-ad') {
        const oid = (profile as Record<string, unknown>)?.oid as string | undefined
        if (!oid) return true
        try {
          userRepo.upsert({ id: oid, name: user.name ?? 'Okänd', email: user.email })
        } catch { /* best effort */ }
      }
      return true
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: { strategy: 'jwt' },
}

export async function getSession() {
  return getServerSession(authOptions)
}

export async function requireAdmin() {
  const session = await getSession()
  if (!session?.user) return null
  const role = (session.user as Record<string, unknown>).role as string | undefined
  if (role !== 'admin') return null
  return session
}

export async function requireUser() {
  const session = await getSession()
  if (!session?.user) return null
  return session
}

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      name?: string | null
      email?: string | null
      image?: string | null
      role?: 'driver' | 'admin'
      phone?: string | null
    }
  }
}
declare module 'next-auth/jwt' {
  interface JWT { oid?: string }
}
