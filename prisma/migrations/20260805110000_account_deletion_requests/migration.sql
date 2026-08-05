-- Google Play / UK GDPR account-deletion compliance: a permanent audit
-- trail of deletion requests (individual user and whole-organization),
-- and a minimal anonymised billing-record snapshot retained only for
-- Heimdell's own accounting obligations. See
-- docs/google-play-account-deletion-implementation.md for the full design.

-- CreateEnum
CREATE TYPE "DeletionRequestType" AS ENUM ('USER', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "DeletionRequestSource" AS ENUM ('IN_APP', 'PUBLIC_WEB');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "requestType" "DeletionRequestType" NOT NULL,
    "source" "DeletionRequestSource" NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "organizationId" TEXT,
    "organizationNameSnapshot" TEXT,
    "userId" TEXT,
    "userEmailSnapshot" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "verificationTokenHash" TEXT,
    "verificationExpiry" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "processingDeadline" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "processingNotes" TEXT,
    "retentionSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_records" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "organizationSlug" TEXT NOT NULL,
    "platformStripeCustomerId" TEXT,
    "platformStripeSubscriptionId" TEXT,
    "lastSubscriptionStatus" TEXT NOT NULL,
    "subscriptionStartedAt" TIMESTAMP(3),
    "subscriptionEndedAt" TIMESTAMP(3) NOT NULL,
    "deletionRequestId" TEXT,
    "retainedUntil" TIMESTAMP(3) NOT NULL,
    "retentionReason" TEXT NOT NULL DEFAULT 'UK accounting/tax record-keeping obligation (Companies Act 2006 s.388 / HMRC guidance: 6 years)',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_requests_organizationId_idx" ON "account_deletion_requests"("organizationId");

-- CreateIndex
CREATE INDEX "account_deletion_requests_userId_idx" ON "account_deletion_requests"("userId");

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests"("status");

-- AddForeignKey (deliberately SET NULL — see model comment in schema.prisma)
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (deliberately SET NULL — see model comment in schema.prisma)
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
