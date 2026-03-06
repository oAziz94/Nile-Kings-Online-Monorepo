-- 1) Migrate any PENDING orders to CREATED before removing PENDING from enum
UPDATE "Order" SET status = 'CREATED' WHERE status = 'PENDING';

-- 2) Replace OrderStatus enum: remove PENDING, default CREATED
CREATE TYPE "OrderStatus_new" AS ENUM ('CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'CREATED'::"OrderStatus_new";

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

-- 3) Add optional variant slug (size + color in URL)
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Variant_slug_key" ON "Variant"("slug") WHERE "slug" IS NOT NULL;
