import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const org = await prisma.organization.findUnique({
    where: { id: "cms54izjq0000jv09lesfy7cd" },
    select: { stripeSecretKey: true, stripeWebhookSecret: true },
  });
  return NextResponse.json({
    stripeWebhookSecretFull: org?.stripeWebhookSecret ?? null,
  });
}
