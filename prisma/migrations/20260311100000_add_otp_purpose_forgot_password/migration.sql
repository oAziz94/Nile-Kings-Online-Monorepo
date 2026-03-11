-- AlterTable
ALTER TABLE "OTPRequest" ADD COLUMN "purpose" TEXT DEFAULT 'login';

-- CreateIndex
CREATE INDEX "OTPRequest_phone_purpose_idx" ON "OTPRequest"("phone", "purpose");
