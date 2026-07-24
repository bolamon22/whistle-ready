import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
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
      const org: any = await prisma.organization.findFirst({ where: { slug } })
      if (org) { brandName = org.name || undefined; brandLogo = org.logoUrl || undefined }
    }
  } catch { /* fall back to Whistle Ready branding */ }
  return <LoginForm brandName={brandName} brandLogo={brandLogo} />
}
