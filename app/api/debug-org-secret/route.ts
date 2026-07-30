import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const org = await prisma.organization.findUnique({
    where: { id: "cms54izjq0000jv09lesfy7cd" },
    select: { stripeSecretKey: true, stripeWebhookSecret: true },
  });
  function mask(v: string | null) {
    if (!v) return null;
    return { length: v.length, start: v.slice(0, 12), end: v.slice(-6), hasWhitespace: /\s/.test(v) };
  }
  return NextResponse.json({
    stripeSecretKey: mask(org?.stripeSecretKey ?? null),
    stripeWebhookSecret: mask(org?.stripeWebhookSecret ?? null),
  });
}
