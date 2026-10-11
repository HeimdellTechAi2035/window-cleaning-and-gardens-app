import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GardenSubscriptionSummaryPanel } from "@/components/customers/garden-subscription-summary";
import { gardenSubscriptionMatchesProperty, type GardenSubscriptionSummary } from "@/lib/garden-plans";

const subscription: GardenSubscriptionSummary = {
  id: "subscription", plan: "LAWN", priceMonthlyPence: 3900, status: "ACTIVE",
  preferredDay: "Monday", tpvVerifiedAt: "2026-10-11T20:32:54Z",
};
describe("customer subscription details", () => {
  it("shows the purchased package, monthly price, visit frequency, included work and verification", () => {
    const html = renderToStaticMarkup(<GardenSubscriptionSummaryPanel subscription={subscription} showIncludedWork />);
    for (const text of ["Lawn Package", "£39.00", "/month", "Fortnightly visits", "Active", "TPV verified", "Preferred day: Monday", "Lawn mowing and edging", "Grass cuttings cleared and removed", "Lawn edges tidied"]) expect(html).toContain(text);
  });
  it("uses the saved subscription price and does not label unverified subscriptions as verified", () => {
    const html = renderToStaticMarkup(<GardenSubscriptionSummaryPanel subscription={{ ...subscription, plan: "SILVER", priceMonthlyPence: 4900, status: "PENDING_TPV", tpvVerifiedAt: null }} />);
    expect(html).toContain("Silver Package"); expect(html).toContain("£49.00");
    expect(html).toContain("Monthly visits"); expect(html).toContain("Awaiting verification");
    expect(html).not.toContain("TPV verified");
  });
  it("shows all the included Gold work", () => {
    const html = renderToStaticMarkup(<GardenSubscriptionSummaryPanel subscription={{ ...subscription, plan: "GOLD", priceMonthlyPence: 7900 }} showIncludedWork />);
    expect(html).toContain("£79.00"); expect(html).toContain("Weeding of beds and borders");
    expect(html).toContain("Seasonal tidy-ups"); expect(html).toContain("Priority scheduling");
  });
  it("matches subscription work to the correct service property using normalized address and postcode", () => {
    const saved = { serviceAddressLine1: "11 Lower Croft", servicePostcode: "PR1 9DJ" };
    expect(gardenSubscriptionMatchesProperty(saved, { addressLine1: " 11 lower  croft ", postcode: "pr19dj" })).toBe(true);
    expect(gardenSubscriptionMatchesProperty(saved, { addressLine1: "12 Lower Croft", postcode: "PR1 9DJ" })).toBe(false);
  });
});
