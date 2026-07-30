import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const results: Record<string, string> = {};

  for (const email of ["payment-flow-test@example.com", "price-verify-test@example.com"]) {
    try {
      const user = await prisma.user.findUnique({ where: { email }, select: { organizationId: true } });
      if (!user) {
        results[email] = "no user found";
        continue;
      }
      await prisma.organization.delete({ where: { id: user.organizationId } });
      results[email] = `deleted org ${user.organizationId}`;
    } catch (e) {
      results[email] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json(results);
}
