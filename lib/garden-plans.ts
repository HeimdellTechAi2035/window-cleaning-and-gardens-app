export const GARDEN_PLANS = {
  LAWN: {
    name: "Lawn Package", visitFrequency: "Fortnightly visits",
    includedWork: ["Lawn mowing and edging", "Grass cuttings cleared and removed", "Lawn edges tidied"],
  },
  SILVER: {
    name: "Silver Package", visitFrequency: "Monthly visits",
    includedWork: ["Lawn mowing and edging", "Grass cuttings cleared and removed", "Hedge trimming (up to 3 hedges)", "Hedge trimmings cleared", "Garden borders tidied"],
  },
  GOLD: {
    name: "Gold Package", visitFrequency: "Monthly visits",
    includedWork: ["Lawn mowing and edging", "Grass cuttings cleared and removed", "Hedge trimming (up to 3 hedges)", "Hedge trimmings cleared", "Garden borders tidied", "Weeding of beds and borders", "Seasonal tidy-ups", "Priority scheduling"],
  },
} as const;

export type GardenSubscriptionSummary = {
  id: string;
  plan: keyof typeof GARDEN_PLANS;
  priceMonthlyPence: number;
  status: "PENDING_MANDATE" | "PENDING_TPV" | "ACTIVE" | "CANCELLED" | "MANDATE_FAILED";
  preferredDay: string | null;
  tpvVerifiedAt: string | null;
};

export const GARDEN_SUBSCRIPTION_STATUS = {
  PENDING_MANDATE: "Awaiting Direct Debit setup",
  PENDING_TPV: "Awaiting verification",
  ACTIVE: "Active", CANCELLED: "Cancelled", MANDATE_FAILED: "Mandate failed",
} as const;

export function gardenSubscriptionMatchesProperty(
  subscription: { serviceAddressLine1: string; servicePostcode: string },
  property: { addressLine1: string; postcode: string },
) {
  const street = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const postcode = (value: string) => value.toUpperCase().replace(/\s/g, "");
  return street(subscription.serviceAddressLine1) === street(property.addressLine1) &&
    postcode(subscription.servicePostcode) === postcode(property.postcode);
}
