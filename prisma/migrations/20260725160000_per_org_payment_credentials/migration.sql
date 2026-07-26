-- Each organization now brings its own Stripe/GoCardless account so that
-- customer payments settle into that organization's own bank account
-- (previously all payments ran through one shared, global API key).
ALTER TABLE "organizations" DROP COLUMN "stripeAccountId";
ALTER TABLE "organizations" ADD COLUMN "stripeSecretKey" TEXT;
ALTER TABLE "organizations" ADD COLUMN "stripeWebhookSecret" TEXT;
ALTER TABLE "organizations" ADD COLUMN "gocardlessWebhookSecret" TEXT;
