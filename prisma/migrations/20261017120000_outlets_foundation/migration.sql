-- CreateEnum
CREATE TYPE "StoreSaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "StorePaymentMethod" AS ENUM ('CASH', 'INSTAPAY', 'CARD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryLedgerReason" ADD VALUE 'STORE_SALE';
ALTER TYPE "InventoryLedgerReason" ADD VALUE 'STORE_SALE_VOID';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "receiptFooter" TEXT,
ADD COLUMN     "storeAddress" TEXT,
ADD COLUMN     "storeName" TEXT;

-- CreateTable
CREATE TABLE "StoreSale" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "receiptNo" INTEGER NOT NULL,
    "status" "StoreSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "StorePaymentMethod" NOT NULL,
    "customerPhone" TEXT,
    "customerName" TEXT,
    "sellerName" TEXT,
    "subtotalPiastres" INTEGER NOT NULL,
    "notes" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePiastres" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,

    CONSTRAINT "StoreSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreSale_partnerId_soldAt_idx" ON "StoreSale"("partnerId", "soldAt");

-- CreateIndex
CREATE INDEX "StoreSale_partnerId_status_idx" ON "StoreSale"("partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSale_partnerId_receiptNo_key" ON "StoreSale"("partnerId", "receiptNo");

-- CreateIndex
CREATE INDEX "StoreSaleItem_saleId_idx" ON "StoreSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "StoreSaleItem_variantId_idx" ON "StoreSaleItem"("variantId");

-- AddForeignKey
ALTER TABLE "StoreSale" ADD CONSTRAINT "StoreSale_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSaleItem" ADD CONSTRAINT "StoreSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "StoreSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSaleItem" ADD CONSTRAINT "StoreSaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
