import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const g = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrisma() {
  // Production / Turso
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter, log: ['error'] })
  }
  // Local fallback
  return new PrismaClient({ log: ['error'] })
}

export const prisma = g.prisma ?? createPrisma()
if (process.env.NODE_ENV !== 'production') g.prisma = prisma
export default prisma
