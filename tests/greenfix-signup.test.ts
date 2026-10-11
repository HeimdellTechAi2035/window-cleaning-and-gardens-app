import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({ prisma: {
  organization: { findUnique: vi.fn() },
  customer: { create: vi.fn(), update: vi.fn() },
  gardenSubscription: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
} }));
vi.mock("@/lib/gocardless", () => ({
  getGoCardlessClient: vi.fn(() => ({})),
  createGoCardlessCustomer: vi.fn(async () => ({ id: "gc-customer" })),
  createMandateRedirectFlow: vi.fn(async () => ({ id: "flow", redirect_url: "https://payments.example/setup" })),
  completeMandateRedirectFlow: vi.fn(async () => ({ links: { mandate: "mandate", customer: "hosted-customer" } })),
}));
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
vi.mock("@/lib/garden-enrollment", () => ({ enrollGardenProperty: vi.fn(async () => ({ id: "property" })) }));

import { prisma } from "@/lib/prisma";
import { createGoCardlessCustomer, createMandateRedirectFlow, completeMandateRedirectFlow } from "@/lib/gocardless";
import { POST, OPTIONS } from "@/app/api/greenfix/subscribe/route";
import { POST as legacySignup } from "@/app/api/public/signup/route";
import middleware from "@/middleware";
import { enrollGardenProperty } from "@/lib/garden-enrollment";

const origin = "https://greenfixexterior-care.co.uk";
const form = {
  firstName: "Test", lastName: "Customer", email: "test@example.com",
  phone: "07700900000", addressLine1: "1 Example Street", city: "Preston", postcode: "PR1 1AA",
};
function request(plan: unknown, source = origin) {
  return new NextRequest("https://roundflow.greenfixexterior-care.co.uk/api/greenfix/subscribe", {
    method: "POST", headers: { Origin: source, "Content-Type": "application/json" },
    body: JSON.stringify({ ...form, plan }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GREENFIX_ORG_ID", "greenfix");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.mocked(prisma.organization.findUnique).mockResolvedValue({ id: "greenfix", gocardlessAccessToken: "mock-token", gocardlessEnv: "sandbox" } as never);
  vi.mocked(prisma.customer.create).mockResolvedValue({ id: "customer" } as never);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Greenfix signup", () => {
  it("accepts the old package/address fields through the compatibility route", async () => {
    const req = new NextRequest("https://roundflow.greenfixexterior-care.co.uk/api/public/signup", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, addressLine1: undefined, address: form.addressLine1, package: "LAWN" }),
    });
    const response = await legacySignup(req);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, success: true, redirectUrl: "https://payments.example/setup" });
  });
  it.each([["lawn", "LAWN", 3900], ["SILVER", "SILVER", 5900], ["gold", "GOLD", 7900]])(
    "accepts %s and saves the agreed price", async (input, plan, price) => {
      const response = await POST(request(input));
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true, redirectUrl: "https://payments.example/setup" });
      expect(prisma.gardenSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ plan, priceMonthlyPence: price, serviceAddressLine1: form.addressLine1 }) });
      expect(createMandateRedirectFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ successRedirectUrl: expect.stringMatching(/^https:\/\/roundflow.greenfixexterior-care.co.uk\/api\/greenfix\/mandate-complete\?/) }));
    }
  );
  it.each([origin, "https://www.greenfixexterior-care.co.uk"])("returns matching CORS headers for %s", async source => {
    const preflight = await OPTIONS(new NextRequest("https://roundflow.greenfixexterior-care.co.uk/api/greenfix/subscribe", { method: "OPTIONS", headers: { Origin: source } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(source);
    const post = await POST(request("lawn", source));
    expect(post.headers.get("Access-Control-Allow-Origin")).toBe(source);
    expect(post.headers.get("Vary")).toBe("Origin");
  });
  it("rejects invalid plans before creating customer or payment records", async () => {
    const response = await POST(request("unknown"));
    expect(response.status).toBe(422);
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(createMandateRedirectFlow).not.toHaveBeenCalled();
  });
  it("returns CORS headers even when the database lookup fails", async () => {
    vi.mocked(prisma.organization.findUnique).mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request("lawn"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });
  it("uses hosted customer creation instead of the restricted direct API", async () => {
    const response = await POST(request("lawn"));
    expect(response.status).toBe(201);
    expect(createGoCardlessCustomer).not.toHaveBeenCalled();
    expect(createMandateRedirectFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      prefilledCustomer: expect.objectContaining({ email: form.email, givenName: form.firstName }),
    }));
  });
  it("does not save a subscription for an incomplete GoCardless flow", async () => {
    vi.mocked(createMandateRedirectFlow).mockResolvedValueOnce({ id: "flow" } as never);
    const response = await POST(request("lawn"));
    expect(response.status).toBe(500);
    expect(prisma.gardenSubscription.create).not.toHaveBeenCalled();
  });
  it("does not grant CORS access to an unrelated origin", async () => {
    const response = await OPTIONS(new NextRequest("https://roundflow.greenfixexterior-care.co.uk/api/greenfix/subscribe", { headers: { Origin: "https://other.example" } }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("unauthenticated signup route access", () => {
  const run = middleware as unknown as (request: NextRequest & { auth: null }) => Response;
  it.each(["/api/greenfix/subscribe", "/api/public/signup", "/signup/success", "/api/greenfix/mandate-complete", "/greenfix/signup-error"])("allows %s without login", path => {
    const req = Object.assign(new NextRequest(`https://roundflow.greenfixexterior-care.co.uk${path}`), { auth: null });
    expect(run(req).headers.get("location")).toBeNull();
  });
  it("still protects the dashboard", () => {
    const req = Object.assign(new NextRequest("https://roundflow.greenfixexterior-care.co.uk/dashboard"), { auth: null });
    expect(run(req).headers.get("location")).toContain("/login");
  });
});

describe("mandate callback", () => {
  it("does not complete the mandate or request another call on a finished callback retry", async () => {
    vi.stubEnv("TPV_API_KEY", "mock-verification-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://roundflow.greenfixexterior-care.co.uk");
    vi.resetModules();
    const { GET } = await import("@/app/api/greenfix/mandate-complete/route");
    vi.mocked(prisma.gardenSubscription.findFirst).mockResolvedValue({
      id: "sub", customerId: "customer", organizationId: "greenfix", gcRedirectFlowId: "flow",
      customer: { id: "customer", gocardlessMandateId: "mandate", portalToken: "portal-token" },
      organization: { id: "greenfix", gocardlessAccessToken: "mock-token", gocardlessEnv: "sandbox" },
    } as never);
    vi.mocked(prisma.gardenSubscription.findUnique).mockResolvedValueOnce({ tpvSaleId: "existing-sale" } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new NextRequest("https://roundflow.greenfixexterior-care.co.uk/api/greenfix/mandate-complete?customerId=customer&session=token&plan=LAWN"));
    expect(completeMandateRedirectFlow).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.gardenSubscription.update).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/portal/portal-token");
  });
  it("uses the stored plan and signup price for phone verification", async () => {
    // The callback module captures environment at import; load a fresh copy.
    vi.stubEnv("TPV_API_KEY", "mock-verification-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://roundflow.greenfixexterior-care.co.uk");
    vi.resetModules();
    const { GET } = await import("@/app/api/greenfix/mandate-complete/route");
    vi.mocked(prisma.gardenSubscription.findFirst).mockResolvedValue({
      id: "sub", plan: "SILVER", priceMonthlyPence: 5900, gcRedirectFlowId: "flow",
      serviceAddressLine1: "1 Example Street", serviceCity: "Preston", servicePostcode: "PR1 1AA",
      customer: { id: "customer", firstName: "Test", lastName: "Customer", phone: "07700900000", portalToken: "portal-token" },
      organization: { id: "greenfix", gocardlessAccessToken: "mock-token", gocardlessEnv: "sandbox" },
    } as never);
    const fetchMock = vi.fn(async () => Response.json({ sale_id: "sale", verification_session_id: "verification" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new NextRequest("https://roundflow.greenfixexterior-care.co.uk/api/greenfix/mandate-complete?customerId=customer&session=token&plan=GOLD"));
    const intake = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(intake.product.name).toBe("Greenfix Silver Package");
    expect(intake.product.subscription_price).toBe("59.00");
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: "customer" }, data: expect.objectContaining({ gocardlessCustomerId: "hosted-customer", gocardlessMandateId: "mandate" }) });
    expect(enrollGardenProperty).toHaveBeenCalledWith(expect.objectContaining({ id: "sub", plan: "SILVER" }));
    expect(response.headers.get("location")).toBe("https://roundflow.greenfixexterior-care.co.uk/portal/portal-token?subscribed=1");
  });
});
