import { NextRequest, NextResponse } from 'next/server'
import { getSubmission, updateSubmissionData } from '@/lib/formSubmissions'
import { orgById } from '@/lib/org'
import { playerPassEnabled } from '@/lib/playerPass'
import { readPhotoToken, firstName, photoPermissionText, instagramHandle, facebookPage } from '@/lib/photoConsent'
import { prisma } from '@/lib/db'

// Public: a parent answering "may we share this photo on social media?"
// (lib/photoConsent). No login -- the signed token in the emailed link is the
// authorization, and it names exactly one waiver.
//   GET  ?t=<token>  → what the page shows: first name, team, event, the photo, the current answer
//   POST { t, answer: 'yes'|'no', name, guardian: true, instagram? } → records the answer
//        clubInstagram?, clubFacebook? }  (handles to tag / invite as Collabs; kept only with a yes)
// Only the player's first name and team go back to the browser: the link can be
// forwarded, so it must not hand out the waiver's other details.

async function load(token: string) {
  const t = readPhotoToken(token)
  if (!t) return null
  const s = await getSubmission(t.o, t.s)
  if (!s || s.formType !== 'player' || s.archivedAt) return null
  return { t, s }
}

export async function GET(req: NextRequest) {
  const token = String(new URL(req.url).searchParams.get('t') || '')
  const hit = await load(token)
  if (!hit) return NextResponse.json({ error: 'This link has expired or is not valid. Reply to the email and we will send a new one.' }, { status: 404 })
  const d = hit.s.data || {}
  const [org, tour, passOn] = await Promise.all([
    orgById(hit.t.o),
    prisma.tournament.findUnique({ where: { id: String(d.tournamentId || '') }, select: { name: true } }).catch(() => null),
    playerPassEnabled(hit.t.o),
  ])
  const orgName = org?.name || 'Sunshine Events Group'
  const tournamentName = tour?.name || 'the tournament'
  return NextResponse.json({
    player: firstName(d.playerName),
    team: [d.clubName, d.teamName].map((x: unknown) => String(x || '').trim()).filter(Boolean).join(' · '),
    orgName,
    tournamentName,
    photo: passOn && hit.s.passToken ? `/pass/${hit.s.passToken}/card.png` : String(d.photoUrl || ''),
    answer: String(d.photoOk || ''),
    answeredAt: String(d.photoOkAt || ''),
    instagram: String(d.photoIg || ''),
    clubInstagram: String(d.photoClubIg || ''),
    clubFacebook: String(d.photoClubFb || ''),
    club: String(d.clubName || ''),
    permission: photoPermissionText(orgName, tournamentName),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const hit = await load(String(body.t || ''))
  if (!hit) return NextResponse.json({ error: 'This link has expired or is not valid.' }, { status: 404 })
  const answer = body.answer === 'yes' ? 'yes' : body.answer === 'no' ? 'no' : ''
  if (!answer) return NextResponse.json({ error: 'Choose yes or no.' }, { status: 400 })
  const name = String(body.name || '').trim().slice(0, 120)
  if (answer === 'yes') {
    if (name.length < 2) return NextResponse.json({ error: 'Type your name to give permission.' }, { status: 400 })
    if (body.guardian !== true) return NextResponse.json({ error: "Please confirm you're the player's parent or guardian." }, { status: 400 })
    if (String(body.instagram || '').trim() && !instagramHandle(body.instagram)) return NextResponse.json({ error: "That doesn't look like an Instagram handle. Try something like @yourname, or leave it blank." }, { status: 400 })
    if (String(body.clubInstagram || '').trim() && !instagramHandle(body.clubInstagram)) return NextResponse.json({ error: "The club's Instagram doesn't look like a handle. Try something like @clubname, or leave it blank." }, { status: 400 })
  }
  await updateSubmissionData(hit.t.o, hit.s.id, {
    photoOk: answer,
    photoOkAt: new Date().toISOString(),
    photoOkName: name,
    photoIg: answer === 'yes' ? instagramHandle(body.instagram) : '',
    photoClubIg: answer === 'yes' ? instagramHandle(body.clubInstagram) : '',
    // A page name or link becomes the page name; anything else (a club name typed
    // with spaces) is kept as typed so staff can still look it up.
    photoClubFb: answer === 'yes' ? (facebookPage(body.clubFacebook) || String(body.clubFacebook || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80)) : '',
  }, `parent (photo permission): ${name || 'no name given'}`)
  return NextResponse.json({ ok: true, answer, instagram: answer === 'yes' ? instagramHandle(body.instagram) : '' })
}
