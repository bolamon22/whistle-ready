import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { tournamentAbs } from '@/lib/seo'
import { orgSlugForHost } from '@/lib/orgDomains'
import { orgForTournament, orgBySlug, orgLogoUrl } from '@/lib/org'
import { issueClaimToken, claimUrl, ensureClaimColumns } from '@/lib/claim'
import { renderEmail, button, panel, absUrl, esc, imageSize, fitBox } from '@/lib/emailLayout'
import { nameKey } from '@/lib/names'

export const dynamic = 'force-dynamic'

// "First time signing in? Email my portal link" on the sign-in page.
//
// A club director reaches the portal through the claim link in their
// registration email. One club couldn't find that email, and the sign-in page
// had nothing for someone who never set a password. Now they type the email on
// their registration and get the link that fits:
//   - no account yet: the claim link for their latest registration, which sets a
//     password and opens the portal;
//   - an account that already opens this club's portal: a sign-in reminder and a
//     one-hour link to choose a password;
//   - an account that doesn't have this club yet: the claim link to add it, plus
//     the password link in case they don't know theirs.
// It always answers {ok:true}, so it can't be used to learn whether an address
// is on a registration or has an account. One email per address per 10 minutes,
// so it can't be used to flood someone's inbox either.
const THROTTLE_MS = 10 * 60 * 1000
const OK = { ok: true }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: unknown }
    const addr = String(body.email || '').trim().toLowerCase()
    if (!addr || addr.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return NextResponse.json(OK)
    if (!emailEnabled()) return NextResponse.json(OK)

    const throttleKey = `portallink:${addr}`
    const last = await prisma.appSetting.findUnique({ where: { key: throttleKey } }).catch(() => null)
    if (last && Date.now() - Number(last.value || 0) < THROTTLE_MS) return NextResponse.json(OK)
    await prisma.appSetting.upsert({
      where: { key: throttleKey },
      update: { value: String(Date.now()) },
      create: { key: throttleKey, value: String(Date.now()) },
    })

    // Their latest registration. Contact emails are typed by clubs, so compare
    // them trimmed and lowercased.
    await ensureClaimColumns()
    const regs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id, r.tournamentId, r.clubName, r."claimToken" AS claimToken, r."claimedAt" AS claimedAt,
              r."claimedByUserId" AS claimedBy, t.name AS tournamentName
       FROM "TeamRegistration" r JOIN "Tournament" t ON t.id = r.tournamentId
       WHERE lower(trim(r.contactEmail)) = ? AND r."deletedAt" IS NULL
       ORDER BY r.createdAt DESC LIMIT 1`, addr)
    const reg = regs?.[0] || null
    const users = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "User" WHERE lower(trim(email)) = ? LIMIT 1`, addr)
    const user = users?.[0] || null
    // Nobody we know: send nothing rather than mail a stranger.
    if (!user && !reg) return NextResponse.json(OK)

    // The letter goes out under the registration's organizer, or the site they
    // asked from, and its links stay on that org's own domain.
    const org = reg ? await orgForTournament(reg.tournamentId) : await orgBySlug(orgSlugForHost(req.headers.get('host')))
    const base = tournamentAbs(org?.slug, '')
    const orgName = org?.name || 'Whistle Ready'
    const logo = org ? absUrl(base, await orgLogoUrl(org.id, org.logoUrl)) : ''
    const loginUrl = `${base}/login`
    const club = esc(reg?.clubName || 'your club')
    const event = esc(reg?.tournamentName || 'the tournament')

    // Does this account already open this registration's portal?
    let linked = false
    if (user && reg) {
      if (reg.claimedBy && reg.claimedBy === user.id) linked = true
      else {
        const links = await prisma.clubDirectorLink.findMany({ where: { userId: user.id, tournamentId: reg.tournamentId } })
        linked = links.some(l => nameKey(l.clubName) === nameKey(reg.clubName))
      }
    }

    // A claim link, when this registration can still be claimed. Reuse the one
    // already on it, so the link in their original email keeps working.
    let claimLink = ''
    if (reg && !reg.claimedAt && !linked) {
      const token = reg.claimToken || await issueClaimToken(reg.id)
      if (token) claimLink = claimUrl(base, token)
    }

    // A one-hour password link (same token format /api/auth/forgot uses).
    let resetLink = ''
    if (user) {
      const token = randomBytes(32).toString('hex')
      const value = JSON.stringify({ userId: user.id, exp: Date.now() + 60 * 60 * 1000 })
      await prisma.appSetting.upsert({ where: { key: `pwreset:${token}` }, update: { value }, create: { key: `pwreset:${token}`, value } })
      resetLink = `${base}/reset/${token}`
    }
    const passwordLine = resetLink
      ? `<p style="margin:16px 0 0">Never set a password, or forgot it? <a href="${resetLink}" style="color:#0f766e;font-weight:700">Choose a new password</a>. That link works once and expires in 1 hour.</p>`
      : ''
    const claimedElsewhere = !!(reg && reg.claimedAt && !linked)
    const elsewhereNote = claimedElsewhere
      ? panel('Your club portal', `${club}&rsquo;s portal for ${event} was set up with a different email. Ask the person who set it up, or reply to this email and the tournament office will add you.`)
      : ''

    let subject: string, title: string, html: string
    if (claimLink && !user) {
      subject = `Your club portal link: ${reg.clubName}`
      title = 'Open your club portal'
      html = `<p style="margin:0 0 4px">Here&rsquo;s the link to ${club}&rsquo;s club portal for ${event}. Choose a password and you&rsquo;re in: your teams, invoice, waivers and schedule in one place.</p>`
        + button(claimLink, 'Open my club portal')
        + `<p style="margin:16px 0 0">After that, sign in at <a href="${loginUrl}" style="color:#0f766e">${esc(loginUrl.replace(/^https?:\/\//, ''))}</a> with ${esc(addr)} and your password.</p>`
    } else if (claimLink) {
      subject = `Add ${reg.clubName} to your account`
      title = 'Link your team to your account'
      html = `<p style="margin:0 0 4px">${esc(addr)} already has an account. Tap below and enter your password to add ${club}&rsquo;s club portal for ${event} to it.</p>`
        + button(claimLink, 'Link my team')
        + (resetLink ? `<p style="margin:16px 0 0">Don&rsquo;t know your password? <a href="${resetLink}" style="color:#0f766e;font-weight:700">Choose a new one</a> first (that link works once and expires in 1 hour), then come back to this email and tap <strong>Link my team</strong>.</p>` : '')
    } else if (user) {
      subject = `Signing in to ${orgName}`
      title = 'You already have an account'
      html = `<p style="margin:0 0 4px">${esc(addr)} already has an account${linked ? `, and it opens ${club}&rsquo;s club portal` : ''}. Sign in with this email and your password.</p>`
        + button(loginUrl, 'Sign in')
        + passwordLine + elsewhereNote
    } else {
      // A registration that someone else already claimed, and no account here.
      // (Anything else means minting the claim token failed: send nothing.)
      if (!claimedElsewhere) return NextResponse.json(OK)
      subject = `Your club portal: ${reg.clubName}`
      title = 'Your club portal is already set up'
      html = `<p style="margin:0">${club}&rsquo;s club portal for ${event} was set up with a different email. Ask the person who set it up to sign in, or reply to this email and the tournament office will add you.</p>`
    }

    await sendEmail({
      to: addr,
      subject,
      html: renderEmail({
        orgName, logoUrl: logo, logoBox: logo ? fitBox(await imageSize(logo), 150, 46) : undefined, eyebrow: 'Club portal', title,
        body: html + `<p style="margin:18px 0 0;font-size:13px;color:#94a3b8">You&rsquo;re getting this because someone asked for a portal link for this address on the sign-in page. Didn&rsquo;t ask? You can ignore it.</p>`,
      }),
      ...orgSender(org),
    })
    return NextResponse.json(OK)
  } catch (e) {
    console.error('[portal-link] failed:', e)
    return NextResponse.json(OK)
  }
}
