-- Transaction/Notification -> Customer previously used ON DELETE RESTRICT,
-- which blocks deleting a customer (and therefore an organization, via
-- deleteOrganizationAsAdminAction in /admin) once they have any payment
-- history or sent notifications — i.e. any real, actively-used org.
-- Discovered while cleaning up a payment-flow-test organization that had
-- a real completed transaction on it.

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_customerId_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_customerId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
