import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptConfig } from '@/lib/encrypt'
import { qboRevoke } from '@/lib/qbo'

// No GET: it returned a provider's whole decrypted config (QuickBooks and Stripe
// tokens and keys) to the browser, and nothing called it. The list
// (api/payment-providers) shows only non-secret details. Removed Oct 5 2026,
// before the QuickBooks connection reaches real books.

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  // Disconnecting QuickBooks also has Intuit revoke the login (lib/qbo qboRevoke).
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT provider, config FROM OrgPaymentProvider WHERE id = ? AND userId = ?`, params.id, userId
  )
  if (rows[0]?.provider === 'quickbooks') await qboRevoke(decryptConfig(rows[0].config))
  await prisma.$executeRawUnsafe(
    `DELETE FROM OrgPaymentProvider WHERE id = ? AND userId = ?`, params.id, userId
  )
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { enabled } = await req.json()
  await prisma.$executeRawUnsafe(
    `UPDATE OrgPaymentProvider SET enabled = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
    enabled ? 1 : 0, new Date().toISOString(), params.id, userId
  )
  return NextResponse.json({ ok: true })
}
