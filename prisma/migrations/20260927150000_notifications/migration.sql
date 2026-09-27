-- Backlog 10.34 — Notifications v1 (data + events). Additive only: one new table,
-- `Notification`, one row per recipient, written once by lib/notifications/notify.ts from the
-- four write points (order created, order assigned, partner cancellation, ticket created).
-- Applied to the redesign Neon branch with db:push:redesign during development; this file is
-- the production equivalent, hand-written in the style of
-- 20260914110000_admin_and_partner_v2_additive (that one was `prisma migrate diff`-generated;
-- this one has no prior migration to diff against since it was authored before db:push, so it
-- is written directly from the schema addition). Contains no DROP.

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
