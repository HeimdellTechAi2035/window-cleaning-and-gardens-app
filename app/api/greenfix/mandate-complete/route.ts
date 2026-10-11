/**
 * GET /api/greenfix/mandate-complete
 *
 * GoCardless redirect-flow success callback. Called by GoCardless after the
 * customer completes DD mandate setup on their hosted page.
 *
 * Query params: customerId, session, plan
 *
 * Steps:
 *   1. Load the GardenSubscription + Customer for this customerId
 *   2. Complete the GoCardless redirect flow to activate the mandate
 *   3. Update Customer with the mandate ID + status
 *   4. Update GardenSubscription → PENDING_TPV
 *   5. POST to Heimdell Verified Consent API to trigger TPV phone call
 *   6. Update GardenSubscription with TPV session details
 *   7. Redirect customer to their portal dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getGoCardlessClient,
  completeMandateRedirectFlow,
} from "@/lib/gocardless";

const TPV_BASE_URL = process.env.TPV_API_URL ?? "https://telecomcompliance.uk";
const TPV_API_KEY  = process.env.TPV_API_KEY ?? "";
const APP_URL      = (process.env.NEXT_PUBLIC_APP_URL || "https://roundflow.uk").replace(/\/$/, "");

const PLAN_DESCRIPTIONS: Record<string, { name: string; price: string; terms: string }> = {
  LAWN: {
    name:  "Greenfix Lawn Package",
    price: "39.00",
    terms: "Fortnightly lawn mowing service. 14-day cooling-off period from signup date. Cancel anytime with 30 days notice.",
  },
  SILVER: {
    name:  "Greenfix Silver Package",
    price: "59.00",
    terms: "Monthly lawn mowing and hedge trimming service. 14-day cooling-off period from signup date. Cancel anytime with 30 days notice.",
  },
  GOLD: {
    name:  "Greenfix Gold Package",
    price: "79.00",
    terms: "Monthly full garden maintenance: lawn mowing, hedge trimming and weeding. 14-day cooling-off period from signup date. Cancel anytime with 30 days notice.",
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId  = searchParams.get("customerId");
  const sessionToken = searchParams.get("session");
  const plan        = searchParams.get("plan");

  if (!customerId || !sessionToken || !plan) {
    return NextResponse.redirect(`${APP_URL}/greenfix/signup-error?reason=missing-params`);
  }

  // Load the subscription
  const subscription = await prisma.gardenSubscription.findFirst({
    where: { customerId, gcSessionToken: sessionToken },
    include: {
      customer:     true,
      organization: { select: { id: true, gocardlessAccessToken: true, gocardlessEnv: true } },
    },
  });

  if (!subscription) {
    return NextResponse.redirect(`${APP_URL}/greenfix/signup-error?reason=not-found`);
  }

  if (!subscription.gcRedirectFlowId) {
    return NextResponse.redirect(`${APP_URL}/greenfix/signup-error?reason=no-flow`);
  }

  const { organization: org, customer } = subscription;

  if (!org.gocardlessAccessToken) {
    return NextResponse.redirect(`${APP_URL}/greenfix/signup-error?reason=no-gc-token`);
  }

  try {
    const gc = getGoCardlessClient(org.gocardlessAccessToken, org.gocardlessEnv ?? "live");

    // 1. Complete the redirect flow to get the mandate ID
    const completedFlow = await completeMandateRedirectFlow(gc, {
      redirectFlowId: subscription.gcRedirectFlowId,
      sessionToken,
    });

    const mandateId = completedFlow.links?.mandate;
    if (!mandateId) throw new Error("No mandate ID in completed flow");

    // 2. Update Customer with GoCardless mandate
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        gocardlessMandateId: mandateId,
        mandateStatus: "pending_submission",
      },
    });

    // 3. Update subscription → PENDING_TPV
    await prisma.gardenSubscription.update({
      where: { id: subscription.id },
      data: { status: "PENDING_TPV" },
    });

    // 4. Trigger TPV via Heimdell Verified Consent API
    const planDesc = PLAN_DESCRIPTIONS[subscription.plan];
    let tpvSaleId: string | null = null;
    let tpvVerificationSessionId: string | null = null;
    let tpvVerificationUrl: string | null = null;

    if (TPV_API_KEY) {
      try {
        const tpvResponse = await fetch(`${TPV_BASE_URL}/api/v1/sales/intake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": TPV_API_KEY,
          },
          body: JSON.stringify({
            client_reference: `greenfix-sub-${subscription.id}`,
            customer: {
              full_name: `${customer.firstName} ${customer.lastName}`,
              phone:     customer.phone ?? "",
              email:     customer.email ?? undefined,
              address:   [
                subscription.serviceAddressLine1,
                subscription.serviceAddressLine2,
                subscription.serviceCity,
                subscription.servicePostcode,
              ]
                .filter(Boolean)
                .join(", "),
            },
            product: {
              name:                        planDesc.name,
              subscription_price:          (subscription.priceMonthlyPence / 100).toFixed(2),
              subscription_frequency:      "monthly",
              subscription_terms_summary:  planDesc.terms,
              policies_summary:
                "Direct Debit payments processed by GoCardless. Governed by the Direct Debit Guarantee. Full T&Cs at greenfixexterior-care.co.uk/terms.",
            },
            sales_channel:        "online",
            verification_method:  "phone_call",
            consent: {
              cooling_off_days: 14,
            },
          }),
        });

        if (tpvResponse.ok) {
          const tpvData = await tpvResponse.json();
          tpvSaleId = tpvData.sale_id ?? null;
          tpvVerificationSessionId = tpvData.verification_session_id ?? null;
          tpvVerificationUrl = tpvData.verification_url ?? null;

          await prisma.gardenSubscription.update({
            where: { id: subscription.id },
            data: {
              tpvSaleId,
              tpvVerificationSessionId,
              tpvVerificationUrl,
            },
          });
        } else {
          const errBody = await tpvResponse.text();
          console.error("[mandate-complete] TPV intake failed:", tpvResponse.status, errBody);
        }
      } catch (tpvErr) {
        // TPV failure is non-fatal — the mandate is set up, admin can trigger TPV manually
        console.error("[mandate-complete] TPV call error:", tpvErr);
      }
    } else {
      console.warn("[mandate-complete] TPV_API_KEY not set — skipping TPV trigger");
    }

    // 5. Redirect to portal
    const portalUrl = `${APP_URL}/portal/${customer.portalToken}?subscribed=1`;
    return NextResponse.redirect(portalUrl);
  } catch (err) {
    console.error("[mandate-complete] error:", err);
    return NextResponse.redirect(`${APP_URL}/greenfix/signup-error?reason=server-error`);
  }
}
