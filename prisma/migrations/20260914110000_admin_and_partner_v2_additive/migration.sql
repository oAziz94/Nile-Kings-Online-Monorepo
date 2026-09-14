-- Backlog 9.10 (PM addition): every additive schema change since the last migration,
-- 20260806093000_cancel_stale_instapay_created_orders_release_reserved — the account v2
-- tickets (7.x), the partner portal v2 (8.x: receipts, payments, thresholds, snapshots,
-- handover, SLA fields) and admin v2 (9.x: AdminAuditLog, MediaAsset, VariantImage,
-- Variant.active, Category.imageUrl, StockReceipt.recordedBy). These were applied to the
-- redesign Neon branch with db:push:redesign during development; this file is the
-- production equivalent, generated with
--   prisma migrate diff --from-schema-datamodel <schema at d13a469> --to-schema-datamodel <schema at dc2a8ce> --script
-- and contains no DROP. It assumes production's schema is at the last migration above;
-- confirm with `prisma migrate diff --from-url <prod> --to-migrations prisma/migrations`
-- (empty diff) before `migrate deploy`. Runs BEFORE 20260914120000_drop_variant_legacy_stock.

-- CreateEnum
CREATE TYPE "OrderTicketSubject" AS ENUM ('DELIVERY_DELAY', 'ADDRESS_CHANGE');

-- CreateEnum
CREATE TYPE "OrderTicketStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketAuthor" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "HandoverMethod" AS ENUM ('COURIER', 'PICKUP', 'OWN_DELIVERY');

-- CreateEnum
CREATE TYPE "PartnerPaymentKind" AS ENUM ('DOWN_PAYMENT', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "StockReceiptKind" AS ENUM ('FACTORY', 'COUNT');

-- CreateEnum
CREATE TYPE "StockReceiptRecordedBy" AS ENUM ('PARTNER', 'ADMIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryLedgerReason" ADD VALUE 'FACTORY_RECEIPT';
ALTER TYPE "InventoryLedgerReason" ADD VALUE 'STOCK_COUNT';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "heroAssetId" TEXT;

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "imageAssetId" TEXT;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "alertPrefs" JSONB,
ADD COLUMN     "alertsSeenAt" TIMESTAMP(3),
ADD COLUMN     "confirmSlaHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "costRateBps" INTEGER NOT NULL DEFAULT 7500,
ADD COLUMN     "dailyOrderCapacity" INTEGER,
ADD COLUMN     "deadStockDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "handoverMethod" "HandoverMethod" NOT NULL DEFAULT 'COURIER',
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "serviceAreas" JSONB,
ADD COLUMN     "shipSlaHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "targetCoverDays" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "workingDays" TEXT[] DEFAULT ARRAY['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI']::TEXT[];

-- AlterTable
ALTER TABLE "InventoryLedger" ADD COLUMN     "stockReceiptId" TEXT;

-- CreateTable
CREATE TABLE "VariantImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "colorKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "assetId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "format" TEXT,
    "folder" TEXT NOT NULL,
    "alt" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTicket" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" "OrderTicketSubject" NOT NULL,
    "status" "OrderTicketStatus" NOT NULL DEFAULT 'OPEN',
    "contactPhone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "OrderTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorRole" "TicketAuthor" NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerStockThreshold" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "threshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerStockThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayment" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "PartnerPaymentKind" NOT NULL,
    "amountPiastres" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "stockReceiptId" TEXT,
    "dueAt" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerStockSnapshot" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "sellableUnits" INTEGER NOT NULL,
    "reservedUnits" INTEGER NOT NULL,
    "valuationPiastres" BIGINT NOT NULL,
    "valuationPricePiastres" BIGINT,
    "coverDays" DOUBLE PRECISION,
    "deadStockSkus" INTEGER NOT NULL,
    "outOfStockSkus" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerStockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "StockReceiptKind" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "totalCostPiastres" INTEGER,
    "recordedBy" "StockReceiptRecordedBy" NOT NULL DEFAULT 'PARTNER',
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousAvailable" INTEGER NOT NULL,
    "newAvailable" INTEGER NOT NULL,
    "unitCostPiastres" INTEGER,

    CONSTRAINT "StockReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantImage_productId_colorKey_sortOrder_idx" ON "VariantImage"("productId", "colorKey", "sortOrder");

-- CreateIndex
CREATE INDEX "VariantImage_assetId_idx" ON "VariantImage"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_publicId_key" ON "MediaAsset"("publicId");

-- CreateIndex
CREATE INDEX "MediaAsset_folder_createdAt_idx" ON "MediaAsset"("folder", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderTicket_orderId_key" ON "OrderTicket"("orderId");

-- CreateIndex
CREATE INDEX "OrderTicket_userId_idx" ON "OrderTicket"("userId");

-- CreateIndex
CREATE INDEX "OrderTicket_status_idx" ON "OrderTicket"("status");

-- CreateIndex
CREATE INDEX "OrderTicketMessage_ticketId_idx" ON "OrderTicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "OrderTicketMessage_createdAt_idx" ON "OrderTicketMessage"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_entityType_entityId_idx" ON "AdminAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerStockThreshold_partnerId_idx" ON "PartnerStockThreshold"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerStockThreshold_partnerId_categoryId_key" ON "PartnerStockThreshold"("partnerId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerStockThreshold_partnerId_productId_key" ON "PartnerStockThreshold"("partnerId", "productId");

-- CreateIndex
CREATE INDEX "PartnerPayment_partnerId_idx" ON "PartnerPayment"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerPayment_stockReceiptId_idx" ON "PartnerPayment"("stockReceiptId");

-- CreateIndex
CREATE INDEX "PartnerPayment_paidAt_idx" ON "PartnerPayment"("paidAt");

-- CreateIndex
CREATE INDEX "PartnerStockSnapshot_partnerId_idx" ON "PartnerStockSnapshot"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerStockSnapshot_day_idx" ON "PartnerStockSnapshot"("day");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerStockSnapshot_partnerId_day_key" ON "PartnerStockSnapshot"("partnerId", "day");

-- CreateIndex
CREATE INDEX "StockReceipt_partnerId_idx" ON "StockReceipt"("partnerId");

-- CreateIndex
CREATE INDEX "StockReceipt_kind_idx" ON "StockReceipt"("kind");

-- CreateIndex
CREATE INDEX "StockReceipt_createdAt_idx" ON "StockReceipt"("createdAt");

-- CreateIndex
CREATE INDEX "StockReceipt_partnerId_createdAt_idx" ON "StockReceipt"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReceiptLine_receiptId_idx" ON "StockReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "StockReceiptLine_variantId_idx" ON "StockReceiptLine"("variantId");

-- CreateIndex
CREATE INDEX "Product_heroAssetId_idx" ON "Product"("heroAssetId");

-- CreateIndex
CREATE INDEX "Variant_imageAssetId_idx" ON "Variant"("imageAssetId");

-- CreateIndex
CREATE INDEX "Variant_active_idx" ON "Variant"("active");

-- CreateIndex
CREATE INDEX "InventoryLedger_stockReceiptId_idx" ON "InventoryLedger"("stockReceiptId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_heroAssetId_fkey" FOREIGN KEY ("heroAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantImage" ADD CONSTRAINT "VariantImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantImage" ADD CONSTRAINT "VariantImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTicket" ADD CONSTRAINT "OrderTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTicket" ADD CONSTRAINT "OrderTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTicketMessage" ADD CONSTRAINT "OrderTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "OrderTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStockThreshold" ADD CONSTRAINT "PartnerStockThreshold_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStockThreshold" ADD CONSTRAINT "PartnerStockThreshold_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStockThreshold" ADD CONSTRAINT "PartnerStockThreshold_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayment" ADD CONSTRAINT "PartnerPayment_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStockSnapshot" ADD CONSTRAINT "PartnerStockSnapshot_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

