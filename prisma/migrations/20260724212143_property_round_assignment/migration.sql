-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "roundId" TEXT,
ADD COLUMN     "roundLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "properties_roundId_idx" ON "properties"("roundId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: prefer the round already used by this property's most recent
-- existing job (reflects any manual merges already done via the Rounds
-- page), since that's a more reliable signal than the city text.
UPDATE "properties" p
SET "roundId" = sub."roundId"
FROM (
  SELECT DISTINCT ON (j."propertyId") j."propertyId", j."roundId"
  FROM "jobs" j
  ORDER BY j."propertyId", j."scheduledDate" DESC
) sub
WHERE p.id = sub."propertyId" AND p."roundId" IS NULL;

-- Backfill: any remaining properties (no jobs yet) by matching city to an
-- existing round's name within the same organization.
UPDATE "properties" p
SET "roundId" = r.id
FROM "customers" c, "rounds" r
WHERE p."customerId" = c.id
  AND r."organizationId" = c."organizationId"
  AND LOWER(TRIM(p.city)) = LOWER(TRIM(r.name))
  AND p."roundId" IS NULL;
