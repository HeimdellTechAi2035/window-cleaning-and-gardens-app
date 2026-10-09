/**
 * POST /api/greenfix/subscribe
 *
 * Public endpoint called from the Greenfix website subscription signup page.
 * Creates a Customer + GardenSubscription in the DB, then creates a GoCardless
 * redirect flow so the customer can set up their Direct Debit mandate.
 *
 * Returns:
 *   { ok: true, redirectUrl: string }  — customer is sent to GoCardless hosted page
 *   { ok: false, error: string }       — validation / server error
 *
 * After the customer completes the GoCardless flow they land on:
 *   GET /api/greenfix/mandate-complete?flow=<id>&session=<token>&customerId=<id>
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getGoCardlessClient,
  createGoCardlessCustomer,
  createMandateRedirectFlow,
} from "@/lib/gocardless";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Plan config
// ---------------------------------------------------------------------------
const PLAN_PRICES: Record<string, { pence: number; label: string; description: string }> = {
  LAWN:   { pence: 2900, label: "Lawn Package",   description: "Monthly lawn mowing — £29/month" },
  SILVER: { pence: 4900, label: "Silver Package", description: "Lawn mowing + hedge trimming — £49/month" },
  GOLD:   { pence: 7900, label: "Gold Package",   description: "Lawn, hedges + weeding — £79/month" },
};

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const subscribeSchema = z.object({
  plan: z.enum(["LAWN", "SILVER", "GOLD"]),
  firstName:    z.string().min(1),
  lastName:     z.string().min(1),
  email:        z.string().email(),
  phone:        z.string().min(7),
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  city:         z.string().min(1),
  postcode:     z.string().min(5).max(8),
  preferredDay: z.string().optional(),
  accessNotes:  z.string().optional(),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // CORS — allow the Greenfix website to call this
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigins = [
    "https://greenfixexterior-care.co.uk",
    "https://www.greenfixexterior-care.co.uk",
  ];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid form data", details: parsed.error.flatten() },
      { status: 422, headers: corsHeaders }
    );
  }

  const data = parsed.data;
  const planConfig = PLAN_PRICES[data.plan];

  // Resolve the Greenfix organization
  const GREENFIX_ORG_ID = process.env.GREENFIX_ORG_ID;
  if (!GREENFIX_ORG_ID) {
    console.error("[greenfix/subscribe] GREENFIX_ORG_ID env var not set");
    return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 500, headers: corsHeaders });
  }

  const org = await prisma.organization.findUnique({
    where: { id: GREENFIX_ORG_ID },
    select: { id: true, gocardlessAccessToken: true, gocardlessEnv: true },
  });

  if (!org?.gocardlessAccessToken) {
    console.error("[greenfix/subscribe] No GoCardless token for org", GREENFIX_ORG_ID);
    return NextResponse.json({ ok: false, error: "Payment system not configured" }, { status: 500, headers: corsHeaders });
  }

  try {
    const gc = getGoCardlessClient(org.gocardlessAccessToken, org.gocardlessEnv ?? "live");

    // 1. Create GoCardless customer
    const gcCustomer = await createGoCardlessCustomer(gc, {
      email:       data.email,
      givenName:   data.firstName,
      familyName:  data.lastName,
      addressLine1: data.addressLine1,
      city:         data.city,
      postalCode:   data.postcode,
      phone:        data.phone,
    });

    // 2. Create / upsert Roundflow Customer record
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://roundflow.greenfixexterior-care.co.uk";
    const sessionToken = crypto.randomBytes(20).toString("hex");

    const customer = await prisma.customer.create({
      data: {
        organizationId:       org.id,
        firstName:            data.firstName,
        lastName:             data.lastName,
        email:                data.email,
        phone:                data.phone,
        billingAddressLine1:  data.addressLine1,
        billingAddressLine2:  data.addressLine2,
        billingCity:          data.city,
        billingPostcode:      data.postcode,
        preferredPaymentMethod: "DIRECT_DEBIT",
        gocardlessCustomerId: gcCustomer.id,
      },
    });

    // 3. Create GoCardless redirect flow
    const successRedirectUrl =
      `${appUrl}/api/greenfix/mandate-complete` +
      `?customerId=${customer.id}&session=${sessionToken}&plan=${data.plan}`;

    const flow = await createMandateRedirectFlow(gc, {
      customerId:         gcCustomer.id,
      sessionToken,
      successRedirectUrl,
      description:        `${planConfig.label} — Greenfix Exterior Care`,
    });

    // 4. Create GardenSubscription record (PENDING_MANDATE)
    await prisma.gardenSubscription.create({
      data: {
        organizationId:      org.id,
        customerId:          customer.id,
        plan:                data.plan as any,
        status:              "PENDING_MANDATE",
        priceMonthlyPence:   planConfig.pence,
        gcRedirectFlowId:    flow.id,
        gcSessionToken:      sessionToken,
        serviceAddressLine1: data.addressLine1,
        serviceAddressLine2: data.addressLine2,
        serviceCity:         data.city,
        servicePostcode:     data.postcode,
        preferredDay:        data.preferredDay,
        accessNotes:         data.accessNotes,
      },
    });

    return NextResponse.json(
      { ok: true, redirectUrl: flow.redirect_url },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[greenfix/subscribe] error:", err);
    return NextResponse.json({ ok: false, error: "Could not start signup. Please try again." }, { status: 500, headers: corsHeaders });
  }
}

// OPTIONS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://greenfixexterior-care.co.uk",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
