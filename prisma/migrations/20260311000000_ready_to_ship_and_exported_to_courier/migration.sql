-- Add READY_TO_SHIP to OrderStatus enum
ALTER TYPE "OrderStatus" ADD VALUE 'READY_TO_SHIP';

-- Add exportedToCourierAt to Order (prevents duplicate courier export)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "exportedToCourierAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_status_exportedToCourierAt_createdAt_idx" ON "Order"("status", "exportedToCourierAt", "createdAt");
