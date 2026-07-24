import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

// SECURITY: this endpoint is public (self-signup for coaches/parents), so it
// must never mint privileged accounts.
//  - Jul 2026: bots were auto-registering and the old code (a) defaulted the
//    role to 'staff' — which can see rosters, contacts and the ops board — and
//    (b) trusted a client-supplied role outright, so anyone could POST
//    {role:'director'} and self-provision staff access. Roles are now
//    allowlisted to EXTERNAL ones only; staff/director/etc. accounts are
//    created exclusively through the admin Users page and invite flows.
//  - The hidden "company" field is a honeypot: humans never see it, form bots
//    dutifully fill it in. We answer them with a success so they move on.
const PUBLIC_ROLES = new Set(['coach', 'parent', 'club_director'])

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role, company } = await req.json()

    // Honeypot tripped — pretend it worked, create nothing.
    if (company) return NextResponse.json({ id: 'ok', name: '', email: '' }, { status: 201 })

    if (!name || !email || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email))) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })

    const safeRole = PUBLIC_ROLES.has(String(role)) ? String(role) : 'parent'

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase(), password: hashed, role: safeRole },
    })
    return NextResponse.json({ id: user.id, name: user.name, email: user.email }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
