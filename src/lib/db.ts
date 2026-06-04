import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

function createPrismaClient() {
  if (process.env.TURSO_DATABASE_URL) {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter, log: ['error'] })
  }
  // fallback to local SQLite for development
  return new PrismaClient({ log: ['error'] })
}

const g = globalThis as unknown as { prisma: PrismaClient | undefined }
export const prisma = g.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') g.prisma = prisma
export default prisma
