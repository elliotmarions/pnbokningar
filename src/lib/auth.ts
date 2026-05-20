import { NextAuthOptions, getServerSession } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
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

// Email + password login (always enabled)
providers.push(
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'E-post', type: 'email' },
      password: { label: 'Lösenord', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null
      try {
        const user = await userRepo.getByEmail(credentials.email)
        if (!user || !user.password_hash) return null
        const valid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!valid) return null
        return { id: user.id, name: user.name, email: user.email ?? undefined }
      } catch {
        return null
      }
    },
  })
)

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === 'azure-ad' && profile) {
        const oid = (profile as Record<string, unknown>).oid as string | undefined
        if (oid) token.oid = oid
      }
      if (account?.provider === 'credentials' && user?.id) {
        token.oid = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token.oid && session.user) {
        ;(session.user as Record<string, unknown>).id = token.oid
        try {
          const dbUser = await userRepo.getById(token.oid as string)
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
          // If a temp account exists with the same email, merge it into the Azure account
          if (user.email) {
            const existing = await userRepo.getByEmail(user.email)
            if (existing && existing.id.startsWith('temp_') && existing.id !== oid) {
              await userRepo.migrateTempToAzure(existing.id, oid, user.name ?? existing.name, user.email)
              return true
            }
          }
          await userRepo.upsert({ id: oid, name: user.name ?? 'Okänd', email: user.email })
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
