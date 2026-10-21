import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import { noteGameWrite } from '@/lib/divisionEdits'
import { checkpointBeforeGameWrite } from '@/lib/assignCheckpoint'

const g = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrisma() {
  let client: PrismaClient
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    const adapter = new PrismaLibSQL(libsql)
    client = new PrismaClient({ adapter, log: ['error'] })
  } else {
    client = new PrismaClient({ log: ['error'] })
  }
  // Stamp the division of every game that's created, moved, re-matched or deleted,
  // so the Scheduler can say which divisions changed since the last Publish
  // (lib/divisionEdits). Skipped inside a transaction: a write outside it could wait
  // on the transaction's own lock.
  // $use is Prisma 5's middleware hook; guarded so a future Prisma without it can't
  // take every database call down with it.
  //
  // Before a Game write that changes the schedule, save a checkpoint of who was on each
  // game (lib/assignCheckpoint), so assigners can see the officials games had before
  // they moved. Also skipped inside a transaction, for the same reason.
  if (typeof (client as any).$use === 'function') client.$use(async (params, next) => {
    if (params.model === 'Game' && !params.runInTransaction) await checkpointBeforeGameWrite(client as any, params.action, params.args)
    const result = await next(params)
    if (params.model === 'Game' && !params.runInTransaction) await noteGameWrite(client as any, params.action, params.args, result)
    return result
  })
  return client
}

export const prisma = g.prisma ?? createPrisma()
if (process.env.NODE_ENV !== 'production') g.prisma = prisma
export default prisma
