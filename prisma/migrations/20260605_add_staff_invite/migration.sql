CREATE TABLE IF NOT EXISTS "StaffInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "tournamentId" TEXT,
    "usedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvite_token_key" ON "StaffInvite"("token");
CREATE INDEX IF NOT EXISTS "StaffInvite_token_idx" ON "StaffInvite"("token");
CREATE INDEX IF NOT EXISTS "StaffInvite_email_idx" ON "StaffInvite"("email");
