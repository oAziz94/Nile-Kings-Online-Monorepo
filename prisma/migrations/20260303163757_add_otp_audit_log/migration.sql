-- CreateTable
CREATE TABLE "OtpAuditLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpAuditLog_phone_idx" ON "OtpAuditLog"("phone");

-- CreateIndex
CREATE INDEX "OtpAuditLog_createdAt_idx" ON "OtpAuditLog"("createdAt");
