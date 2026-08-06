import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/platform-billing", () => ({
  constructPlatformStripeWebhookEvent: vi.fn(),
  getPlatformStripe: vi.fn(() => {
    throw new Error("getPlatformStripe should never be called for the reviewer organisation");
  }),
}));

import { prisma } from "@/lib/prisma";
import { constructPlatformStripeWebhookEvent } from "@/lib/platform-billing";
import { POST } from "@/app/api/webhooks/platform-stripe/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; this file tests business logic, not Prisma's type surface.
const db = prisma as any;

function makeRequest(body: string, withSignature = true): Request {
  return new Request("https://example.invalid/api/webhooks/platform-stripe", {
    method: "POST",
    headers: withSignature ? { "stripe-signature": "test-signature" } : {},
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("platform-stripe webhook — reviewer organisation exemption (defence in depth)", () => {
  it("rejects a request with no Stripe signature before ever touching the database", async () => {
    const response = await POST(makeRequest("{}", false));
    expect(response.status).toBe(400);
    expect(db.organization.findUnique).not.toHaveBeenCalled();
  });

  it("does not deactivate the reviewer organisation on customer.subscription.deleted", async () => {
    db.organization.findUnique.mockResolvedValue({ isReviewerOrganisation: true });
    vi.mocked(constructPlatformStripeWebhookEvent).mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { organizationId: "reviewer-org-1" } } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal synthetic Stripe.Event for this test only
    } as any);

    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(200);
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("still cancels a normal (non-reviewer) organisation's access on the same event type", async () => {
    db.organization.findUnique.mockResolvedValue({ isReviewerOrganisation: false });
    vi.mocked(constructPlatformStripeWebhookEvent).mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { organizationId: "real-org-1" } } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal synthetic Stripe.Event for this test only
    } as any);

    await POST(makeRequest("{}"));

    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: "real-org-1" },
      data: { subscriptionStatus: "canceled" },
    });
  });

  it("does not sync the reviewer organisation's status on customer.subscription.updated", async () => {
    db.organization.findUnique.mockResolvedValue({ isReviewerOrganisation: true });
    vi.mocked(constructPlatformStripeWebhookEvent).mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_reviewer",
          status: "past_due",
          metadata: { organizationId: "reviewer-org-1" },
          trial_end: null,
          current_period_end: Math.floor(Date.now() / 1000),
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal synthetic Stripe.Event for this test only
    } as any);

    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(200);
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("checks the reviewer exemption before ever calling getPlatformStripe() on checkout.session.completed", async () => {
    db.organization.findUnique.mockResolvedValue({ isReviewerOrganisation: true });
    vi.mocked(constructPlatformStripeWebhookEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "reviewer-org-1",
          subscription: "sub_reviewer",
          customer: "cus_reviewer",
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal synthetic Stripe.Event for this test only
    } as any);

    // getPlatformStripe is mocked to throw if it's ever invoked — if the
    // reviewer-exemption check didn't run first, this call would throw and
    // the response below would not be a clean 200.
    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(200);
    expect(db.organization.update).not.toHaveBeenCalled();
  });
});
