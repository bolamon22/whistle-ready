// Run with: node setup-turso.js
// This creates all tables in your Turso database

const { createClient } = require('@libsql/client')
require('dotenv').config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const tables = [
  `CREATE TABLE IF NOT EXISTS "Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL DEFAULT '',
    "endDate" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "scheduleIncrement" INTEGER NOT NULL DEFAULT 50,
    "dates" TEXT NOT NULL DEFAULT '[]',
    "payRates" TEXT NOT NULL DEFAULT '{"youth":50,"hs":60,"college":70,"scorekeeper":15,"athletic_trainer":25,"field_ops":20,"assigner":10}',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "registrationPricing" TEXT NOT NULL DEFAULT '{"tier1":1495,"tier1Max":3,"tier2":1450,"tier2Max":6,"tier3":1395,"sevenVSeven":1095}',
    "registrationDivisions" TEXT NOT NULL DEFAULT '["Boys 2030","Boys 2029","Boys 2028","Boys 2027","Boys 2026","Boys 2025","Boys 2024","Boys 2023","Girls 2030","Girls 2029","Girls 2028","Girls 2027","Girls 2026","Girls 2025","Girls 2024","Girls 2023","HS Boys JV","HS Boys Varsity","HS Girls JV","HS Girls Varsity"]',
    "divisionRules" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "gameNumber" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "pool" TEXT,
    "location" TEXT NOT NULL,
    "team1" TEXT NOT NULL,
    "team2" TEXT NOT NULL,
    "score1" INTEGER,
    "score2" INTEGER,
    "refCount" INTEGER NOT NULL DEFAULT 2,
    "isChampionship" INTEGER NOT NULL DEFAULT 0,
    "isCanceled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Worker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "certLevel" TEXT NOT NULL DEFAULT 'youth',
    "defaultRole" TEXT NOT NULL DEFAULT 'ref',
    "isAssigner" INTEGER NOT NULL DEFAULT 0,
    "gender" TEXT NOT NULL DEFAULT 'both',
    "photoUrl" TEXT,
    "payRateOverride" REAL,
    "hourlyRate" REAL,
    "roles" TEXT NOT NULL DEFAULT '[]',
    "payMethod" TEXT NOT NULL DEFAULT 'check',
    "payHandle" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "RosterEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "gameTarget" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE,
    UNIQUE("workerId", "tournamentId")
  )`,
  `CREATE TABLE IF NOT EXISTS "Availability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timeSlots" TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE,
    UNIQUE("workerId", "tournamentId", "date")
  )`,
  `CREATE TABLE IF NOT EXISTS "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "hoursManual" REAL,
    "notes" TEXT,
    "isManualEdit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "payRate" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE,
    FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE,
    UNIQUE("gameId", "role")
  )`,
  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "deletedBy" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "TeamRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "clubContact" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "clubBasedIn" TEXT NOT NULL DEFAULT '',
    "clubWebsite" TEXT NOT NULL DEFAULT '',
    "numTeams" INTEGER NOT NULL DEFAULT 1,
    "needsHotel" TEXT NOT NULL DEFAULT 'No',
    "paymentMethod" TEXT NOT NULL DEFAULT 'check',
    "notes" TEXT,
    "invoiceAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "discountNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "RegistrationPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'check',
    "checkNumber" TEXT NOT NULL DEFAULT '',
    "receivedAt" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("registrationId") REFERENCES "TeamRegistration"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "RegisteredTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "coachName" TEXT NOT NULL,
    "coachPhone" TEXT NOT NULL,
    "coachEmail" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    FOREIGN KEY ("registrationId") REFERENCES "TeamRegistration"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "PlayerRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "playerEmail" TEXT NOT NULL DEFAULT '',
    "usLacrosseNumber" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "dob" TEXT NOT NULL DEFAULT '',
    "grade" TEXT NOT NULL,
    "teamClubName" TEXT NOT NULL,
    "jerseyNumber" TEXT NOT NULL DEFAULT '',
    "parentName" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "parent2Name" TEXT NOT NULL DEFAULT '',
    "parent2Email" TEXT NOT NULL DEFAULT '',
    "parent2Phone" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL,
    "emergencyContactPhone" TEXT NOT NULL,
    "waiverSignature" TEXT NOT NULL,
    "needsHotel" TEXT NOT NULL DEFAULT '',
    "wantsUpdates" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'check',
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "paidBy" TEXT,
    FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "UserTournamentFollow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("userId", "tournamentId")
  )`,
  `CREATE TABLE IF NOT EXISTS "UserTeamFollow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("userId", "tournamentId", "teamName")
  )`,
  `CREATE TABLE IF NOT EXISTS "CoachProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "tournamentId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ClubDirectorLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("userId", "tournamentId", "clubName")
  )`,
  `CREATE TABLE IF NOT EXISTS "ParentPlayerLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "playerRegistrationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("playerRegistrationId") REFERENCES "PlayerRegistration"("id") ON DELETE CASCADE,
    UNIQUE("userId", "playerRegistrationId")
  )`,
  `CREATE TABLE IF NOT EXISTS "TournamentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'check',
    "date" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
  )`,
]

async function main() {
  console.log('Connecting to Turso:', process.env.TURSO_DATABASE_URL)
  let created = 0
  for (const sql of tables) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)?.[1]
    try {
      await client.execute(sql)
      console.log(`✓ ${tableName}`)
      created++
    } catch (e) {
      console.error(`✗ ${tableName}:`, e.message)
    }
  }
  console.log(`\nDone! ${created}/${tables.length} tables ready in Turso.`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
