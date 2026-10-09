-- CreateEnum
CREATE TYPE "GardenSubscriptionPlan" AS ENUM ('LAWN', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "GardenSubscriptionStatus" AS ENUM ('PENDING_MANDATE', 'PENDING_TPV', 'ACTIVE', 'CANCELLED', 'MANDATE_FAILED');

-- CreateTable
CREATE TABLE "garden_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "plan" "GardenSubscriptionPlan" NOT NULL,
    "status" "GardenSubscriptionStatus" NOT NULL DEFAULT 'PENDING_MANDATE',
    "gcRedirectFlowId" TEXT,
    "gcSessionToken" TEXT,
    "priceMonthlyPence" INTEGER NOT NULL,
    "tpvSaleId" TEXT,
    "tpvVerificationSessionId" TEXT,
    "tpvVerificationUrl" TEXT,
    "tpvVerifiedAt" TIMESTAMP(3),
    "serviceAddressLine1" TEXT NOT NULL,
    "serviceAddressLine2" TEXT,
    "serviceCity" TEXT NOT NULL,
    "servicePostcode" TEXT NOT NULL,
    "accessNotes" TEXT,
    "preferredDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garden_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "garden_subscriptions_organizationId_idx" ON "garden_subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "garden_subscriptions_customerId_idx" ON "garden_subscriptions"("customerId");

-- AddForeignKey
ALTER TABLE "garden_subscriptions" ADD CONSTRAINT "garden_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_subscriptions" ADD CONSTRAINT "garden_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
