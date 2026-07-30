-- Removes the throwaway organizations created to test the Stripe payment
-- flow end-to-end ("Test Payment Flow Co" and "Price Verify Co"). Deleting
-- the organization cascades (onDelete: Cascade) to its users, customers,
-- properties, rounds, jobs, and transactions.
DELETE FROM "organizations"
WHERE id IN (
  SELECT "organizationId" FROM "users"
  WHERE email IN ('payment-flow-test@example.com', 'price-verify-test@example.com')
);
