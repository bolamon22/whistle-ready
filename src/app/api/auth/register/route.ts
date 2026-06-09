import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role } = await req.json()
    if (!name || !email || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase(), password: hashed, role: role ?? 'staff' },
    })
    return NextResponse.json({ id: user.id, name: user.name, email: user.email }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
