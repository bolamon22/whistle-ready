import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { SITE_URL } from '@/lib/seo'
import { ORG_DOMAINS } from '@/lib/orgDomains'

// Host-aware robots.txt.
//
// This used to emit the build-time SITE_URL unconditionally, so
// sunshineeventsgroup.com/robots.txt advertised `Host: https://whistleready.app`
// and pointed its Sitemap at whistleready.app — telling crawlers that an org's
// own domain preferred a different host, the exact opposite of the canonical
// strategy in seo.ts. The `Host:` directive is gone for good (Yandex-only, and
// nothing here wants it); Sitemap now follows the domain being asked.
//
// headers() makes this dynamic, so it is resolved per request rather than baked
// at build. The try/catch keeps the old static behaviour as the failure mode.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  let origin = SITE_URL
  try {
    const host = (headers().get('host') || '').replace(/:\d+$/, '').toLowerCase()
    const bare = host.replace(/^www\./, '')
    if (bare && ORG_DOMAINS[bare]) origin = `https://${bare}`
  } catch { /* fall back to SITE_URL */ }

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/admin', '/login'] },
    ],
    sitemap: `${origin}/sitemap.xml`,
  }
}
