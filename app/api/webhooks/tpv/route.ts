import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const payloadSchema = z.object({
  event: z.string(), client_id: z.string(), sale_id: z.string(),
  verification_session_id: z.string(), client_reference: z.string().nullable(),
  status: z.string(),
});

export async function POST(request: Request) {
  const secret = process.env.TPV_WEBHOOK_SECRET;
  const clientId = process.env.TPV_CLIENT_ID;
  if (!secret || !clientId) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("x-hvcs-signature") ?? "";
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const expected = createHmac("sha256", secret).update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload;
  try { payload = payloadSchema.parse(JSON.parse(body)); }
  catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  if (payload.client_id !== clientId) return NextResponse.json({ error: "Invalid client" }, { status: 403 });

  if (!["verification.completed", "subscription.verified"].includes(payload.event) ||
      !["VERIFIED", "COMPLETED"].includes(payload.status)) {
    return NextResponse.json({ received: true, updated: 0 });
  }
  const prefix = "greenfix-sub-";
  if (!payload.client_reference?.startsWith(prefix)) return NextResponse.json({ received: true, updated: 0 });
  const result = await prisma.gardenSubscription.updateMany({
    where: {
      id: payload.client_reference.slice(prefix.length),
      tpvSaleId: payload.sale_id,
      tpvVerificationSessionId: payload.verification_session_id,
      status: "PENDING_TPV",
      customer: { gocardlessMandateId: { not: null } },
    },
    data: { status: "ACTIVE", tpvVerifiedAt: new Date() },
  });
  return NextResponse.json({ received: true, updated: result.count });
}
