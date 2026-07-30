-- Same class of bug as the previous migration: Job.roundId/propertyId/
-- serviceId used ON DELETE RESTRICT (Prisma's default for required
-- relations), which would block deleteOrganizationAsAdminAction for any
-- organization that has jobs at all — i.e. virtually every real,
-- actively-used organization, not just an edge case.

ALTER TABLE "jobs" DROP CONSTRAINT "jobs_roundId_fkey";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jobs" DROP CONSTRAINT "jobs_propertyId_fkey";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jobs" DROP CONSTRAINT "jobs_serviceId_fkey";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
