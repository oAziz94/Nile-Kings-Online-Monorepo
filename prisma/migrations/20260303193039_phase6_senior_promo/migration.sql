-- CreateTable
CREATE TABLE "SeniorVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
  "nationalIdEncrypted" TEXT NOT NULL,
  "nationalIdFingerprint" TEXT NOT NULL,
  "nationalIdLast4" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeniorVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeniorVerification_userId_key" ON "SeniorVerification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SeniorVerification_nationalIdFingerprint_key" ON "SeniorVerification"("nationalIdFingerprint");

-- CreateIndex
CREATE INDEX "SeniorVerification_nationalIdFingerprint_idx" ON "SeniorVerification"("nationalIdFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_key_key" ON "SiteSetting"("key");

-- CreateIndex
CREATE INDEX "SiteSetting_key_idx" ON "SiteSetting"("key");

-- AddForeignKey
ALTER TABLE "SeniorVerification" ADD CONSTRAINT "SeniorVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
