import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await prisma.$executeRaw`ALTER TABLE "Worker" ADD COLUMN "association" TEXT NOT NULL DEFAULT ''`;
    return NextResponse.json({ ok: true, message: 'Column added' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message });
  }
}
