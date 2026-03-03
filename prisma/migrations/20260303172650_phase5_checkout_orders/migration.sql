/*
  Warnings:

  - Added the required column `paymentMethod` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shippingProvider` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CREATED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "codFeePiastres" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentMethod" TEXT NOT NULL,
ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "seniorFreeValuePiastres" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingProvider" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Order_reservationExpiresAt_idx" ON "Order"("reservationExpiresAt");
