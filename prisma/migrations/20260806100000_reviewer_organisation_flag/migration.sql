-- Google Play reviewer/demo tenant marker. Purely additive: two nullable/
-- defaulted columns on the existing "organizations" table, no new tables,
-- no new relations, no drops. See docs/google-play-reviewer-access-template.md
-- and app/actions/reviewer-access.ts for the full design.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "isReviewerOrganisation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "reviewerDemoDataResetAt" TIMESTAMP(3);
