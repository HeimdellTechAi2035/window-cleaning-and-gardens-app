-- One-off: grandfather the "Test Payment Flow Co" throwaway org (created to
-- verify the per-job Stripe/GoCardless payment flow end-to-end) so it can
-- reach the dashboard without a real subscription checkout.
UPDATE "organizations"
SET "subscriptionStatus" = 'active'
WHERE id IN (SELECT "organizationId" FROM "users" WHERE email = 'payment-flow-test@example.com');
