import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { Resend } from 'resend'

const APP_URL = process.env.NEXTAUTH_URL || 'https://whistleready.app'
const FROM_EMAIL = process.env.INVITE_FROM_EMAIL || 'invites@gamedaystaff.com'

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json() as {
    clubs: { clubName: string; contactEmail: string; contactName: string; numTeams?: number; divisions?: string[] }[]
    subjectTemplate?: string
    bodyTemplate?: string
  }
  const { clubs } = body
  if (!clubs?.length) return NextResponse.json({ error: 'clubs required' }, { status: 400 })

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { name: true, startDate: true, endDate: true },
  })
  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const regUrl = `${APP_URL}/tournaments/${params.id}/register`
  const fmtDate = (d: string) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${parseInt(m)}/${parseInt(day)}/${y}`
  }
  const dateStr = tournament.startDate
    ? tournament.endDate && tournament.endDate !== tournament.startDate
      ? `${fmtDate(tournament.startDate)} – ${fmtDate(tournament.endDate)}`
      : fmtDate(tournament.startDate)
    : 'TBD'

  const defaultSubject = `{{tournamentName}} — Registration Now Open`
  const defaultBody = `Hi {{contactName}},

We hope you had a great experience at our last event! We are excited to invite {{clubName}} back for {{tournamentName}}, taking place on {{dates}}.

Last year, your club brought {{lastYearTeams}} team(s) competing in: {{lastYearDivisions}}.

We would love to see you back on the field. Registration is now open — click the link below to secure your spot before divisions fill up.

{{registerUrl}}

Please don't hesitate to reach out with any questions.

Best regards,
Bo Lamon
Whistle Ready`

  const subjectTemplate = body.subjectTemplate ?? defaultSubject
  const bodyTemplate = body.bodyTemplate ?? defaultBody

  const fromName = tournament.name || 'Whistle Ready'

  const resend = new Resend(process.env.RESEND_API_KEY)
  let sent = 0
  const errors: string[] = []

  for (const club of clubs) {
    const vars: Record<string, string> = {
      clubName: club.clubName,
      contactName: club.contactName || club.clubName,
      tournamentName: tournament.name,
      dates: dateStr,
      registerUrl: regUrl,
      lastYearTeams: String(club.numTeams ?? '—'),
      lastYearDivisions: club.divisions?.join(', ') ?? '—',
    }

    const subject = applyVars(subjectTemplate, vars)
    const plainBody = applyVars(bodyTemplate, vars)

    // Convert plain text body to simple HTML
    const htmlBody = plainBody
      .split('\n\n')
      .map(para => `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">${para.replace(/\n/g, '<br/>')}</p>`)
      .join('')

    try {
      await resend.emails.send({
        from: `${fromName} <${FROM_EMAIL}>`,
        to: club.contactEmail,
        subject,
        html: `
          <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:40px 28px;background:#ffffff;">
            <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 24px;border-bottom:2px solid #e5e7eb;padding-bottom:16px;">
              ${tournament.name}
            </h2>
            ${htmlBody}
            <div style="margin:28px 0;">
              <a href="${regUrl}"
                style="display:inline-block;background:#0f172a;color:white;font-weight:600;
                       font-size:15px;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                Register Now →
              </a>
            </div>
          </div>
        `,
      })
      sent++
    } catch (e: any) {
      errors.push(`${club.clubName}: ${e.message}`)
    }
  }

  return NextResponse.json({ sent, errors })
}
