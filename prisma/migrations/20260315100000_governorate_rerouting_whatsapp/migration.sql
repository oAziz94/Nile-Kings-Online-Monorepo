-- CreateEnum
CREATE TYPE "RoutedOrderStatus" AS ENUM ('ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'UNROUTED');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "ReroutingRule" (
    "id" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAssignedPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReroutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReroutingRulePartner" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReroutingRulePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutedOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "ruleId" TEXT,
    "partnerId" TEXT,
    "assignmentSequence" INTEGER NOT NULL DEFAULT 0,
    "assignmentMode" "AssignmentMode" NOT NULL DEFAULT 'AUTO',
    "status" "RoutedOrderStatus" NOT NULL DEFAULT 'ASSIGNED',
    "notifiedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "proofImageUrl" TEXT,
    "proofImagePublicId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReroutingRule_governorate_key" ON "ReroutingRule"("governorate");

-- CreateIndex
CREATE INDEX "ReroutingRule_governorate_idx" ON "ReroutingRule"("governorate");

-- CreateIndex
CREATE INDEX "ReroutingRule_isActive_idx" ON "ReroutingRule"("isActive");

-- CreateIndex
CREATE INDEX "ReroutingRulePartner_ruleId_idx" ON "ReroutingRulePartner"("ruleId");

-- CreateIndex
CREATE INDEX "ReroutingRulePartner_partnerId_idx" ON "ReroutingRulePartner"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReroutingRulePartner_ruleId_partnerId_key" ON "ReroutingRulePartner"("ruleId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutedOrder_orderId_key" ON "RoutedOrder"("orderId");

-- CreateIndex
CREATE INDEX "RoutedOrder_orderId_idx" ON "RoutedOrder"("orderId");

-- CreateIndex
CREATE INDEX "RoutedOrder_governorate_idx" ON "RoutedOrder"("governorate");

-- CreateIndex
CREATE INDEX "RoutedOrder_ruleId_idx" ON "RoutedOrder"("ruleId");

-- CreateIndex
CREATE INDEX "RoutedOrder_partnerId_idx" ON "RoutedOrder"("partnerId");

-- CreateIndex
CREATE INDEX "RoutedOrder_status_idx" ON "RoutedOrder"("status");

-- CreateIndex
CREATE INDEX "RoutedOrder_createdAt_idx" ON "RoutedOrder"("createdAt");

-- AddForeignKey
ALTER TABLE "ReroutingRule" ADD CONSTRAINT "ReroutingRule_lastAssignedPartnerId_fkey" FOREIGN KEY ("lastAssignedPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReroutingRulePartner" ADD CONSTRAINT "ReroutingRulePartner_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReroutingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReroutingRulePartner" ADD CONSTRAINT "ReroutingRulePartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutedOrder" ADD CONSTRAINT "RoutedOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutedOrder" ADD CONSTRAINT "RoutedOrder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReroutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutedOrder" ADD CONSTRAINT "RoutedOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
