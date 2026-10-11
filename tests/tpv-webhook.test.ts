import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { gardenSubscription: { updateMany: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/webhooks/tpv/route";
const payload = {
  event: "verification.completed", client_id: "greenfix-client", sale_id: "sale",
  verification_session_id: "session", client_reference: "greenfix-sub-subscription", status: "VERIFIED",
};
function request(overrides = {}, signature?: string) {
  const body = JSON.stringify({ ...payload, ...overrides });
  return new Request("https://roundflow.greenfixexterior-care.co.uk/api/webhooks/tpv", {
    method: "POST", body, headers: { "x-hvcs-signature": signature ?? "sha256=" + createHmac("sha256", "test-secret").update(body).digest("hex") },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TPV_WEBHOOK_SECRET", "test-secret"); vi.stubEnv("TPV_CLIENT_ID", "greenfix-client");
  vi.mocked(prisma.gardenSubscription.updateMany).mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());
describe("TPV verification return", () => {
  it("activates only the matching pending subscription with a linked mandate", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ received: true, updated: 1 });
    expect(prisma.gardenSubscription.updateMany).toHaveBeenCalledWith({ where: {
      id: "subscription", tpvSaleId: "sale", tpvVerificationSessionId: "session", status: "PENDING_TPV",
      customer: { gocardlessMandateId: { not: null } },
    }, data: { status: "ACTIVE", tpvVerifiedAt: expect.any(Date) } });
  });
  it.each(["invalid", "sha256=00", "sha256=" + "0".repeat(64)])("rejects bad signatures without updates: %s", async signature => {
    expect((await POST(request({}, signature))).status).toBe(401);
    expect(prisma.gardenSubscription.updateMany).not.toHaveBeenCalled();
  });
  it("rejects another client", async () => {
    expect((await POST(request({ client_id: "other-client" }))).status).toBe(403);
    expect(prisma.gardenSubscription.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ event: "verification.link_created" }, { status: "DECLINED" }, { client_reference: "other-subscription" }])("ignores events that cannot confirm this subscription", async overrides => {
    expect((await POST(request(overrides))).status).toBe(200);
    expect(prisma.gardenSubscription.updateMany).not.toHaveBeenCalled();
  });
  it("acknowledges repeated or unrelated confirmations without changing verified time", async () => {
    vi.mocked(prisma.gardenSubscription.updateMany).mockResolvedValue({ count: 0 });
    expect(await (await POST(request())).json()).toEqual({ received: true, updated: 0 });
  });
});
