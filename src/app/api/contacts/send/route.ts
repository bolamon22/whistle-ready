import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { tasksGate } from '@/lib/tasksGate'
import { getTask, inScope, scopeTournaments, updateTask } from '@/lib/tasks'
import { getContact, updateContact } from '@/lib/contacts'
import { sendEmail, orgSender } from '@/lib/email'
import { orgById } from '@/lib/org'
import { todayET } from '@/lib/publicView'
import { docKind, isEmail, MAX_ATTACHMENT_BYTES } from '@/lib/contactSend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/contacts/send  (multipart form)
//   file, kind (coi|w9|other), tournamentId, contactIds (JSON), emails (JSON),
//   subject, message, mode (send|me), copyMe (1|0), saveDoc (1|0), taskIds (JSON)
//
// Sends a document (a certificate of insurance, a W-9...) to event contacts,
// with the email already written (Bo, Oct 5 2026). Only ever runs when Bo
// presses a button. mode=send mails the contacts from the org's sender with
// replies going to Bo (and a copy to him); mode=me mails it to Bo alone, ready
// to forward from his own inbox. After a real send the contacts' "last contact"
// moves to today, a "we owe a reply" flag clears, and the chosen tasks are
// checked off. The file can be kept in the event's Documents.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = (s: string) => esc(s).replace(/\n/g, '<br>')
const list = (v: FormDataEntryValue | null): string[] => {
  try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a.map(String).filter(Boolean).slice(0, 20) : [] } catch { return [] }
}

export async function POST(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Nothing was sent' }, { status: 400 }) }

  const mode = form.get('mode') === 'me' ? 'me' : 'send'
  const kind = docKind(String(form.get('kind') || 'other'))
  const subject = String(form.get('subject') || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const message = String(form.get('message') || '').replace(/\r\n/g, '\n').trim().slice(0, 8000)
  const tournamentId = String(form.get('tournamentId') || '')
  const copyMe = form.get('copyMe') !== '0'
  const saveDoc = form.get('saveDoc') === '1'
  const file = form.get('file') as File | null

  if (!subject || !message) return NextResponse.json({ error: 'Add a subject and a message' }, { status: 400 })
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Attach the document' }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!bytes.length) return NextResponse.json({ error: 'That file is empty' }, { status: 400 })
  if (bytes.length > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'File too large (10 MB max)' }, { status: 413 })
  const fileName = (file.name || 'document.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 160)

  try {
    const ts = await scopeTournaments(g.scope)
    const event = tournamentId ? ts.find(t => t.id === tournamentId) : null
    if (tournamentId && !event) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    // Recipients: the chosen contacts this login can see, plus typed addresses.
    const contacts = []
    for (const id of list(form.get('contactIds'))) {
      const c = await getContact(id)
      if (c && inScope(g.scope, c.orgId) && isEmail(c.email)) contacts.push(c)
    }
    const extra = list(form.get('emails')).map(e => e.trim()).filter(isEmail)
    const to = Array.from(new Map([...contacts.map(c => c.email.trim()), ...extra].map(e => [e.toLowerCase(), e])).values())
    if (!to.length) return NextResponse.json({ error: 'Pick who it goes to' }, { status: 400 })
    if (to.length > 10) return NextResponse.json({ error: 'Ten recipients at most' }, { status: 400 })
    const me = isEmail(g.email) ? g.email : ''
    if (mode === 'me' && !me) return NextResponse.json({ error: 'Your login has no email address to send it to' }, { status: 400 })

    const org = await orgById(g.orgId || event?.orgId || '')
    const sender = orgSender(org)
    const attachments = [{ filename: fileName, content: Buffer.from(bytes).toString('base64'), type: file.type || 'application/pdf' }]

    const res = mode === 'me'
      ? await sendEmail({
          to: me,
          subject: `Ready to forward: ${subject}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
            <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px 14px;margin-bottom:16px">
              <b>Forward this to:</b> ${esc(to.join(', '))}<br>
              <b>Subject:</b> ${esc(subject)}<br>
              <span style="color:#475569">Delete this box and the "Ready to forward" line, then send.</span>
            </div>${html(message)}</div>`,
          text: `Forward this to: ${to.join(', ')}\nSubject: ${subject}\n\n${message}`,
          attachments,
          ...sender,
        })
      : await sendEmail({
          to,
          subject,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">${html(message)}</div>`,
          text: message,
          ...(copyMe && me ? { cc: me } : {}),
          attachments,
          ...sender,
          // Replies come straight back to the person who sent it.
          ...(me ? { replyTo: me } : {}),
          ...(g.by && org?.name ? { fromName: `${g.by} · ${org.name}` } : {}),
        })
    if (!res.ok) return NextResponse.json({ error: `The email didn't go out: ${res.error || 'unknown error'}` }, { status: 502 })

    // Bookkeeping after a real send. Each step is best-effort: the email is out.
    const done: string[] = []
    if (mode === 'send') {
      const today = todayET()
      for (const c of contacts) {
        try {
          const note = `${today}: sent ${kind.label.toLowerCase()}${event ? ` (${event.name})` : ''}: ${fileName}`
          await updateContact(c.id, {
            lastContact: today,
            ...(c.waiting === 'us' ? { waiting: '' } : {}),
            notes: c.notes ? `${c.notes}\n${note}` : note,
          }, new Set())
        } catch (e) { console.error('[contacts/send] contact update failed (non-blocking):', e) }
      }
      for (const id of list(form.get('taskIds'))) {
        try {
          const t = await getTask(id)
          if (t && inScope(g.scope, t.orgId) && !t.done) { await updateTask(id, { done: true }, g.by); done.push(id) }
        } catch (e) { console.error('[contacts/send] task check-off failed (non-blocking):', e) }
      }
    }

    let savedDoc = ''
    if (saveDoc && event) {
      try {
        const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
        // Same table the Documents tab uses (api/tournaments/[id]/documents).
        await client.execute(`CREATE TABLE IF NOT EXISTS "TournamentDocument" (
          "id" TEXT PRIMARY KEY, "tournamentId" TEXT NOT NULL, "name" TEXT NOT NULL,
          "category" TEXT NOT NULL DEFAULT 'Other', "mime" TEXT NOT NULL, "size" INTEGER NOT NULL DEFAULT 0,
          "data" BLOB NOT NULL, "uploadedBy" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')))`)
        const dup = await client.execute({ sql: `SELECT "id" FROM "TournamentDocument" WHERE "tournamentId" = ? AND "name" = ? AND "size" = ? LIMIT 1`, args: [event.id, fileName, bytes.length] })
        if (dup.rows.length) savedDoc = String(dup.rows[0].id)
        else {
          savedDoc = crypto.randomUUID()
          await client.execute({
            sql: `INSERT INTO "TournamentDocument" ("id","tournamentId","name","category","mime","size","data","uploadedBy") VALUES (?,?,?,?,?,?,?,?)`,
            args: [savedDoc, event.id, fileName, kind.docCategory, file.type || 'application/pdf', bytes.length, bytes, g.by],
          })
        }
      } catch (e) { console.error('[contacts/send] saving the document failed (non-blocking):', e); savedDoc = '' }
    }

    return NextResponse.json({ ok: true, mode, to: mode === 'me' ? [me] : to, tasksDone: done, savedDoc })
  } catch (e) {
    console.error('[api/contacts/send] failed:', e)
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 })
  }
}
