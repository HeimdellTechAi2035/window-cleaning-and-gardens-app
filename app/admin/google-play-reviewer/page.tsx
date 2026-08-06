import { requireSuperAdmin } from "@/lib/super-admin";
import { getReviewerAccessStatus } from "@/lib/reviewer-access";
import { GooglePlayReviewerPanel } from "@/components/admin/google-play-reviewer-panel";

export default async function GooglePlayReviewerPage() {
  await requireSuperAdmin();
  const status = await getReviewerAccessStatus();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Google Play Reviewer Access</h1>
        <p className="text-sm text-muted-foreground">
          A dedicated, fictional demonstration organisation for Google Play reviewers to sign into and test
          RoundFlow immediately — never real GreenFix or customer data, never a real Stripe/GoCardless charge.
        </p>
      </div>
      <GooglePlayReviewerPanel
        status={{
          ...status,
          reviewerDemoDataResetAt: status.reviewerDemoDataResetAt ? status.reviewerDemoDataResetAt.toISOString() : null,
        }}
      />
    </div>
  );
}
