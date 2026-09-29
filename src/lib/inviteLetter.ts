import { prisma } from '@/lib/db'
import { INVITE_LETTER_DEFAULTS, type InviteAudience } from '@/lib/inviteLetterText'

// The database half. Everything pure -- audiences, defaults, merging, HTML -- lives
// in inviteLetterText.ts so client components can use it; re-exported here so every
// existing import of this module keeps working.
export * from '@/lib/inviteLetterText'

export async function inviteLetterFor(orgId: string | null, audience: InviteAudience): Promise<{ subject: string; body: string; custom: boolean }> {
  if (orgId) {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `inviteLetter:${audience}:${orgId}` } })
      if (row?.value) {
        const v = JSON.parse(row.value) as { subject?: unknown; body?: unknown }
        if (typeof v?.subject === 'string' && typeof v?.body === 'string' && v.body.trim()) {
          return { subject: v.subject, body: v.body, custom: true }
        }
      }
    } catch { /* bad JSON or no table — fall through to default */ }
  }
  return { ...INVITE_LETTER_DEFAULTS[audience], custom: false }
}
