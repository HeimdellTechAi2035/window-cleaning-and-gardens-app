-- Manual pin-placement lock. Purely additive: one defaulted column on the
-- existing "properties" table, no new tables, no drops. See
-- lib/route-optimizer.ts, app/actions/customers.ts, and
-- app/actions/organization.ts for where this is read/written.

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "coordinatesLocked" BOOLEAN NOT NULL DEFAULT false;
