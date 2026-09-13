import { headers } from 'next/headers'
import { orgBySlug } from '@/lib/org'
import { orgSlugForHost } from '@/lib/orgDomains'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

// On an org's custom domain the login leads with the ORG (logo + name) and
// Whistle Ready appears as "Powered by"; on whistleready.app it's WR-branded.
export default async function LoginPage() {
  let brandName: string | undefined
  let brandLogo: string | undefined
  try {
    const slug = orgSlugForHost(headers().get('host'))
    if (slug) {
      // Organization is raw SQL, not a Prisma model -- prisma.organization is
      // undefined on the typed client, so the old call threw and this whole
      // block fell through to Whistle Ready branding on EVERY org domain.
      const org = await orgBySlug(slug)
      if (org) { brandName = org.name || undefined; brandLogo = org.logoUrl || undefined }
    }
  } catch { /* fall back to Whistle Ready branding */ }
  return <LoginForm brandName={brandName} brandLogo={brandLogo} />
}
