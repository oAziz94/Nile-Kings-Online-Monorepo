-- Additive partner inventory/routing migration.
-- No legacy stock fields are removed; Variant stockAvailable/stockReserved remain compatibility fields.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PARTNER';

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assignedPartnerId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingOriginGovernorate" TEXT;

DO $$
BEGIN
  CREATE TYPE "InventoryLedgerReason" AS ENUM (
    'MANUAL_ADJUSTMENT',
    'ORDER_RESERVE',
    'ORDER_COMMIT',
    'ORDER_RELEASE',
    'ORDER_RESTORE',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'RESTOCK_REQUEST_CREATE',
    'RESTOCK_REQUEST_FULFILL',
    'LEGACY_BACKFILL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RestockRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'FULFILLED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PartnerInventory" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "stockAvailable" INTEGER NOT NULL DEFAULT 0,
  "stockReserved" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PartnerInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryLedger" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "reason" "InventoryLedgerReason" NOT NULL,
  "quantityAvailableDelta" INTEGER NOT NULL DEFAULT 0,
  "quantityReservedDelta" INTEGER NOT NULL DEFAULT 0,
  "orderId" TEXT,
  "routedOrderId" TEXT,
  "restockRequestId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RestockRequest" (
  "id" TEXT NOT NULL,
  "sourcePartnerId" TEXT NOT NULL,
  "destinationPartnerId" TEXT NOT NULL,
  "status" "RestockRequestStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "responseNotes" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RestockRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RestockRequestItem" (
  "id" TEXT NOT NULL,
  "restockRequestId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,

  CONSTRAINT "RestockRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Partner_userId_key" ON "Partner"("userId");
CREATE INDEX IF NOT EXISTS "Partner_userId_idx" ON "Partner"("userId");
CREATE INDEX IF NOT EXISTS "Partner_phone_idx" ON "Partner"("phone");
CREATE INDEX IF NOT EXISTS "Partner_governorate_idx" ON "Partner"("governorate");
CREATE INDEX IF NOT EXISTS "Order_assignedPartnerId_idx" ON "Order"("assignedPartnerId");
CREATE INDEX IF NOT EXISTS "Order_shippingOriginGovernorate_idx" ON "Order"("shippingOriginGovernorate");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerInventory_partnerId_variantId_key" ON "PartnerInventory"("partnerId", "variantId");
CREATE INDEX IF NOT EXISTS "PartnerInventory_partnerId_idx" ON "PartnerInventory"("partnerId");
CREATE INDEX IF NOT EXISTS "PartnerInventory_variantId_idx" ON "PartnerInventory"("variantId");
CREATE INDEX IF NOT EXISTS "PartnerInventory_stockAvailable_idx" ON "PartnerInventory"("stockAvailable");

CREATE INDEX IF NOT EXISTS "InventoryLedger_partnerId_idx" ON "InventoryLedger"("partnerId");
CREATE INDEX IF NOT EXISTS "InventoryLedger_variantId_idx" ON "InventoryLedger"("variantId");
CREATE INDEX IF NOT EXISTS "InventoryLedger_orderId_idx" ON "InventoryLedger"("orderId");
CREATE INDEX IF NOT EXISTS "InventoryLedger_routedOrderId_idx" ON "InventoryLedger"("routedOrderId");
CREATE INDEX IF NOT EXISTS "InventoryLedger_restockRequestId_idx" ON "InventoryLedger"("restockRequestId");
CREATE INDEX IF NOT EXISTS "InventoryLedger_reason_idx" ON "InventoryLedger"("reason");
CREATE INDEX IF NOT EXISTS "InventoryLedger_createdAt_idx" ON "InventoryLedger"("createdAt");

CREATE INDEX IF NOT EXISTS "RestockRequest_sourcePartnerId_idx" ON "RestockRequest"("sourcePartnerId");
CREATE INDEX IF NOT EXISTS "RestockRequest_destinationPartnerId_idx" ON "RestockRequest"("destinationPartnerId");
CREATE INDEX IF NOT EXISTS "RestockRequest_status_idx" ON "RestockRequest"("status");
CREATE INDEX IF NOT EXISTS "RestockRequest_createdAt_idx" ON "RestockRequest"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RestockRequestItem_restockRequestId_variantId_key" ON "RestockRequestItem"("restockRequestId", "variantId");
CREATE INDEX IF NOT EXISTS "RestockRequestItem_variantId_idx" ON "RestockRequestItem"("variantId");

DO $$
BEGIN
  ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedPartnerId_fkey" FOREIGN KEY ("assignedPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PartnerInventory" ADD CONSTRAINT "PartnerInventory_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PartnerInventory" ADD CONSTRAINT "PartnerInventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_sourcePartnerId_fkey" FOREIGN KEY ("sourcePartnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_destinationPartnerId_fkey" FOREIGN KEY ("destinationPartnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RestockRequestItem" ADD CONSTRAINT "RestockRequestItem_restockRequestId_fkey" FOREIGN KEY ("restockRequestId") REFERENCES "RestockRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RestockRequestItem" ADD CONSTRAINT "RestockRequestItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
