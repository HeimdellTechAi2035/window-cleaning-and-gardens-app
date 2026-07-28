-- RoundFlow's own subscription billing (an organization paying us to use
-- the app) — separate from the per-org Stripe/GoCardless keys added
-- earlier, which are for that organization charging its own customers.
ALTER TABLE "organizations" ADD COLUMN "platformStripeCustomerId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "platformStripeSubscriptionId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'incomplete';
ALTER TABLE "organizations" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

-- Grandfather in every organization that existed before subscription
-- billing was introduced, so switching this on doesn't lock anyone out
-- of an app they were already using without having gone through checkout.
UPDATE "organizations" SET "subscriptionStatus" = 'active';
