import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
}

const STATUSES = ['todo', 'in-progress', 'done']

export async function PATCH(req: Request, { params }: { params: { itemId: string } }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { status, title, description } = await req.json()
  const client = getClient()
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    await client.execute({ sql: 'UPDATE "RoadmapItem" SET status = ? WHERE id = ?', args: [status, params.itemId] })
  }
  if (title !== undefined) {
    await client.execute({ sql: 'UPDATE "RoadmapItem" SET title = ? WHERE id = ?', args: [title, params.itemId] })
  }
  if (description !== undefined) {
    await client.execute({ sql: 'UPDATE "RoadmapItem" SET description = ? WHERE id = ?', args: [description, params.itemId] })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: { itemId: string } }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const client = getClient()
  await client.execute({ sql: 'DELETE FROM "RoadmapItem" WHERE id = ?', args: [params.itemId] })
  return NextResponse.json({ ok: true })
}
