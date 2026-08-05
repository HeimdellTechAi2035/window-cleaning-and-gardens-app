-- Abuse-protection counters for the unauthenticated public deletion-request
-- endpoints (/legal/delete-account and its email-verification step) only.
-- Fixed-window request counters, keyed by a HMAC hash of IP address / email
-- — never the raw value. No relations to any other table, deliberately, so
-- this table can never interfere with (or be affected by) account or
-- organization deletion. See
-- docs/google-play-account-deletion-implementation.md for the full design.

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_scope_key_key" ON "rate_limit_buckets"("scope", "key");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");
